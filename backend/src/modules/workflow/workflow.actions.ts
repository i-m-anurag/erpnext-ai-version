import { In } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { env } from '../../config/env.js';
import { enqueueEmail } from '../../queue/queues.js';
import { activityService } from '../activity/index.js';
import { permissionService } from '../permission/index.js';
import { notificationService } from '../communication/index.js';
import { User } from '../auth/user.entity.js';
import { Assignment } from './assignment.entity.js';
import { assignmentService } from './assignment.service.js';
import type { RuleAction } from './workflow.schema.js';

const assignments = new BaseRepository(Assignment);
const users = new BaseRepository(User);

/** Store-agnostic record the rule engine mutates (satisfied by master rows and documents). */
export interface WorkflowRecord {
  id: string;
  state: string | null;
  data: Record<string, unknown>;
}

export interface ActionContext {
  entityType: string;
  recordId: string;
  /** mutable — set_state / set_field change this; the caller saves once */
  row: WorkflowRecord;
  actorUserId: string;
  ruleName: string;
}

/**
 * Execute one rule action. Sync actions (set_state/set_field/assign) take effect
 * in-request; email is enqueued to the worker (async). Returns whether the
 * record's data/state was mutated (so the caller knows to persist).
 */
export async function executeAction(action: RuleAction, ctx: ActionContext): Promise<{ mutated: boolean }> {
  switch (action.type) {
    case 'set_state':
      ctx.row.state = action.to;
      return { mutated: true };
    case 'set_field':
      ctx.row.data = { ...ctx.row.data, [action.field]: action.value };
      return { mutated: true };
    case 'assign':
      await runAssign(action, ctx);
      return { mutated: false };
    case 'email':
      await runEmail(action, ctx);
      return { mutated: false };
    default:
      return { mutated: false };
  }
}

async function runAssign(action: Extract<RuleAction, { type: 'assign' }>, ctx: ActionContext): Promise<void> {
  let candidates = [...(action.users ?? [])];
  if (action.role) candidates = candidates.concat(await permissionService.userIdsWithRoleCode(action.role));
  candidates = [...new Set(candidates)];
  if (candidates.length === 0) return;

  // least_loaded (default): fewest OPEN assignments wins. round_robin approximates
  // the same with this small set.
  let assignee = candidates[0]!;
  let best = Infinity;
  for (const c of candidates) {
    const count = await assignments.count({ assigneeUserId: c, status: 'open' });
    if (count < best) {
      best = count;
      assignee = c;
    }
  }

  await assignments.save(
    assignments.create({
      entityType: ctx.entityType,
      recordId: ctx.recordId,
      assigneeUserId: assignee,
      status: 'open',
      ruleName: ctx.ruleName,
      // Context for the audit trail: assigned AS this role, in the record's current
      // state, BY the acting user (see assignment.entity / AssignmentService).
      role: action.role ?? null,
      state: ctx.row.state,
      assignedByUserId: ctx.actorUserId,
    }),
  );
  const user = await users.findById(assignee);
  const name = user?.displayName ?? user?.username ?? 'user';
  await activityService.addTimeline(ctx.entityType, ctx.recordId, 'assigned', `Assigned to ${name}`, ctx.actorUserId);

  // Notify the new assignee. In-app is live; the email channel is logged only in
  // this phase (dispatch is a TODO inside NotificationService).
  const context = { entityType: ctx.entityType, recordId: ctx.recordId, purpose: 'assigned' };
  await notificationService.notify({
    channel: 'in_app',
    recipients: [{ userId: assignee }],
    title: `You've been assigned ${ctx.recordId}`,
    body: `${ctx.entityType} ${ctx.recordId} is now with you${ctx.row.state ? ` (${ctx.row.state})` : ''}.`,
    context,
  });
  if (user?.email) {
    await notificationService.notify({
      channel: 'email',
      recipients: [{ email: user.email }],
      template: 'record-assigned',
      title: `You've been assigned ${ctx.recordId}`,
      vars: buildVars(ctx),
      context,
    });
  }
}

async function runEmail(action: Extract<RuleAction, { type: 'email' }>, ctx: ActionContext): Promise<void> {
  const recipients = await resolveRecipients(action.to, ctx);
  if (recipients.length === 0) return;
  const vars = buildVars(ctx);
  for (const to of recipients) {
    await enqueueEmail({ slug: action.template, to, vars });
  }
  await activityService.addTimeline(
    ctx.entityType,
    ctx.recordId,
    'email_sent',
    `Queued email "${action.template}" to ${recipients.length} recipient(s)`,
    ctx.actorUserId,
  );
}

/** Recipient tokens: a literal email, "role:<code>", or "{{doc.field}}". */
async function resolveRecipients(tokens: string[], ctx: ActionContext): Promise<string[]> {
  const out: string[] = [];
  for (const t of tokens) {
    const tok = t.trim();
    if (tok.startsWith('role:')) {
      const ids = await permissionService.userIdsWithRoleCode(tok.slice(5));
      out.push(...(await emailsOf(ids)));
    } else if (tok === 'assignee') {
      const id = await assignmentService.activeAssignee(ctx.entityType, ctx.recordId);
      if (id) out.push(...(await emailsOf([id])));
    } else if (tok === 'requester') {
      const id = await activityService.creatorOf(ctx.entityType, ctx.recordId);
      if (id) out.push(...(await emailsOf([id])));
    } else if (tok.startsWith('{{') && tok.endsWith('}}')) {
      const field = tok.slice(2, -2).replace(/^doc\./, '').trim();
      const v = ctx.row.data[field];
      if (typeof v === 'string' && v.includes('@')) out.push(v);
    } else if (tok.includes('@')) {
      out.push(tok);
    }
  }
  return [...new Set(out)];
}

function buildVars(ctx: ActionContext): Record<string, string | number> {
  const out: Record<string, string | number> = {
    appName: env.app.name,
    recordId: ctx.recordId,
    state: String(ctx.row.state ?? ''),
  };
  for (const [k, v] of Object.entries(ctx.row.data)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    out[k] = v as string | number;
  }
  return out;
}

async function emailsOf(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await users.find({ where: { id: In(ids) } });
  return rows.map((u) => u.email).filter(Boolean);
}
