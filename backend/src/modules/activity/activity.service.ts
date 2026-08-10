import { In } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { User } from '../auth/user.entity.js';
import { Comment } from './comment.entity.js';
import { TimelineEntry, type TimelineKind } from './timeline-entry.entity.js';

export interface ActorDto {
  id: string;
  name: string;
}
export interface TimelineDto {
  id: string;
  kind: TimelineKind;
  summary: string;
  data: Record<string, unknown> | null;
  actor: ActorDto | null;
  createdAt: Date;
}
export interface CommentDto {
  id: string;
  body: string;
  author: ActorDto;
  createdAt: Date;
}

/**
 * Activity feed (timeline) + comments for any record, keyed by (entityType,
 * recordId). `recordId` is the record's natural code (e.g. a PO number). Other
 * modules call `addTimeline()` to record state changes / assignments / emails.
 */
export class ActivityService {
  private readonly timeline = new BaseRepository(TimelineEntry);
  private readonly comments = new BaseRepository(Comment);
  private readonly users = new BaseRepository(User);

  async listTimeline(entityType: string, recordId: string): Promise<TimelineDto[]> {
    const rows = await this.timeline.find({
      where: { entityType, recordId },
      order: { createdAt: 'DESC' },
    });
    const names = await this.resolveNames(rows.map((r) => r.actorUserId).filter((x): x is string => !!x));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      summary: r.summary,
      data: r.data,
      actor: r.actorUserId ? { id: r.actorUserId, name: names.get(r.actorUserId) ?? 'User' } : null,
      createdAt: r.createdAt,
    }));
  }

  /** The user who created the record — the actor of its earliest `created` timeline
   *  entry — or null if unknown. Used for workflow self-approval gating. */
  async creatorOf(entityType: string, recordId: string): Promise<string | null> {
    const row = await this.timeline.findOne(
      { entityType, recordId, kind: 'created' },
      { order: { createdAt: 'ASC' } },
    );
    return row?.actorUserId ?? null;
  }

  async addTimeline(
    entityType: string,
    recordId: string,
    kind: TimelineKind,
    summary: string,
    actorUserId: string | null,
    data: Record<string, unknown> | null = null,
  ): Promise<void> {
    await this.timeline.save(
      this.timeline.create({ entityType, recordId, kind, summary, actorUserId, data }),
    );
  }

  async listComments(entityType: string, recordId: string): Promise<CommentDto[]> {
    const rows = await this.comments.find({
      where: { entityType, recordId },
      order: { createdAt: 'ASC' },
    });
    const names = await this.resolveNames(rows.map((r) => r.authorUserId));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      author: { id: r.authorUserId, name: names.get(r.authorUserId) ?? 'User' },
      createdAt: r.createdAt,
    }));
  }

  async addComment(
    entityType: string,
    recordId: string,
    body: string,
    authorUserId: string,
  ): Promise<CommentDto> {
    const saved = await this.comments.save(
      this.comments.create({ entityType, recordId, body, authorUserId }),
    );
    await this.addTimeline(entityType, recordId, 'commented', truncate(body, 120), authorUserId);
    const names = await this.resolveNames([authorUserId]);
    return {
      id: saved.id,
      body: saved.body,
      author: { id: authorUserId, name: names.get(authorUserId) ?? 'User' },
      createdAt: saved.createdAt,
    };
  }

  /** id → display name (or username) for a set of user ids. */
  private async resolveNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.users.find({ where: { id: In(unique) } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.username]));
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export const activityService = new ActivityService();
