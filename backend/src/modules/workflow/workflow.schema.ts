import { z } from 'zod';

/**
 * Workflow = States (for the stepper) + a RULE ENGINE. A rule is triggered by a
 * user action and contains if/else-if/else BRANCHES; the first branch whose
 * conditions all pass runs its ACTIONS (set state, assign, email, set field).
 * Assignment and email are just action types — one engine, not three.
 */
export const workflowStateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  /** Cross-document "Create next" buttons are allowed only in states that set this. */
  allowCreateNext: z.boolean().optional(),
});

export type ConditionValue = string | number | boolean | null;
export const conditionValueSchema: z.ZodType<ConditionValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

/**
 * A single field comparison. Conditions in a branch are ANDed. The right-hand side
 * is either a literal `value` OR a dynamic `valueField` (another field on the same
 * record) — so branches can compare two fields, not only a field to a hard-coded
 * constant (e.g. `acceptedQty <= orderedQty`, or `total > approvedBudget`).
 */
export const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['==', '!=', '<', '<=', '>', '>=']),
  value: conditionValueSchema.optional(),
  valueField: z.string().min(1).optional(),
});

/** Action registry (extensible). */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_state'), to: z.string().min(1) }),
  z.object({ type: z.literal('set_field'), field: z.string().min(1), value: conditionValueSchema }),
  z.object({ type: z.literal('email'), template: z.string().min(1), to: z.array(z.string()).default([]) }),
  z.object({
    type: z.literal('assign'),
    role: z.string().optional(),
    users: z.array(z.string()).optional(),
    strategy: z.enum(['least_loaded', 'round_robin']).default('least_loaded'),
    /**
     * Dynamic routing by the approval matrix: pick from users with `role` who are
     * in the record's branch AND whose (role, branch) limit covers the record's
     * amount. `amountField`/`branchField` name the record fields to read.
     */
    byLimit: z
      .object({
        amountField: z.string().min(1),
        branchField: z.string().min(1).default('branch'),
      })
      .optional(),
  }),
]);

/**
 * A branch runs when its condition holds. Two forms:
 *  • `when` — a JSONLogic expression over the attribute context (doc.* / user.* /
 *    system.* / lookup.*), e.g. `{">":[{"var":"doc.amount"},{"var":"lookup.limit"}]}`.
 *  • `conditions` — the legacy structured {field,op,value} list (over doc.* only).
 * An empty branch (no `when`, empty `conditions`) is the else branch (always true).
 */
export const branchSchema = z.object({
  when: z.record(z.string(), z.unknown()).optional(),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).default([]),
});

export const ruleSchema = z.object({
  name: z.string().min(1),
  trigger: z.object({
    on: z.literal('action'),
    action: z.string().min(1),
    /** null/absent = available from any state */
    fromState: z.string().nullable().optional(),
    /** role codes allowed to trigger; empty = any authenticated user */
    roles: z.array(z.string()).default([]),
    /** when true, only the record's current assignee may fire this action. */
    requiresAssignee: z.boolean().optional(),
  }),
  branches: z.array(branchSchema).default([]),
});

/**
 * A derived (looked-up) attribute made available to conditions as `lookup.<key>`.
 * Phase 1 supports `matrix` — the approval-matrix limit for a role in the record's
 * branch (so `doc.amount > lookup.<key>` expresses amount-vs-approval-limit).
 * `doc.*` (form fields), `user.*` (roles/branch) and `system.*` are always present.
 */
export const attributeSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(['text', 'number', 'date', 'boolean']).optional(),
  source: z.literal('matrix'),
  matrix: z.object({
    role: z.string().min(1),
    branchField: z.string().default('branch'),
  }),
});

/** One approver in a serial chain: a role (optionally scoped to the record's branch)
 *  or a named user. */
export const approvalStepSchema = z.object({
  approver: z.enum(['role', 'user']),
  role: z.string().optional(),
  user: z.string().optional(),
  branchScoped: z.boolean().optional(),
});

/**
 * An approval chain attached to a triggering action (e.g. Submit). The FIRST rule
 * whose `when` (JSONLogic) matches supplies the ordered approver `steps` (amount
 * tiers → deeper chains). While the chain runs the record sits in `pendingState`;
 * clearing all steps moves it to `onApproved`, a rejection to `onRejected`.
 */
export const approvalConfigSchema = z.object({
  action: z.string().min(1),
  pendingState: z.string().min(1),
  onApproved: z.string().min(1),
  onRejected: z.string().min(1),
  rules: z
    .array(
      z.object({
        when: z.record(z.string(), z.unknown()).optional(),
        steps: z.array(approvalStepSchema).min(1),
      }),
    )
    .default([]),
});

export const workflowDefinitionSchema = z.object({
  slug: z.string().min(1),
  appliesTo: z.string().min(1),
  startState: z.string().min(1),
  states: z.array(workflowStateSchema).min(1),
  rules: z.array(ruleSchema).default([]),
  /** derived `lookup.*` attributes usable in JSONLogic conditions. */
  attributes: z.array(attributeSchema).default([]),
  /** serial approval chains attached to triggering actions. */
  approvals: z.array(approvalConfigSchema).default([]),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type RuleBranch = z.infer<typeof branchSchema>;
export type RuleAction = z.infer<typeof actionSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type WorkflowAttribute = z.infer<typeof attributeSchema>;
export type ApprovalConfig = z.infer<typeof approvalConfigSchema>;
