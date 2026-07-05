import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { configResolver } from '../config/index.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { activityService } from '../activity/index.js';
import { namingSeriesService } from '../naming/index.js';
import { documentDataService } from './document-data.service.js';
import { workflowService } from '../workflow/workflow.service.js';
import { DocumentLink } from './document-link.entity.js';
import { DOCUMENT_PIPELINE_RESOURCE_TYPE, type Pipeline, type PipelineStep } from './document-pipeline.schema.js';

export interface CreateOption {
  to: string;
  label: string;
  relation: string;
  /** Set when a document of this type was already created from the source — the UI
   *  then offers a redirect to it instead of a "Create" action. */
  existing?: { master: string; code: string };
}
export interface RelatedDoc {
  master: string;
  code: string;
  relation: string;
  direction: 'up' | 'down';
}

/**
 * Document chaining: "create the next document" (from the fixed macro pipeline)
 * and lineage queries. New docs are created as DRAFTS (validation deferred to the
 * record screen) and a link records the parentage in both directions.
 */
export class DocumentService {
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly data = new BaseRepository(MasterData);
  private readonly linkRepo = new BaseRepository(DocumentLink);

  private async pipeline(): Promise<Pipeline> {
    const eff = await configResolver.resolve<Pipeline>(DOCUMENT_PIPELINE_RESOURCE_TYPE, 'default');
    return eff.definition;
  }

  /**
   * Documents that can be created FROM the given record. For a step whose target
   * already exists (a down-link of that type), `existing` is filled so the caller
   * can redirect to it instead of offering another "create".
   */
  async createOptions(fromMaster: string, fromCode?: string): Promise<CreateOption[]> {
    const pl = await this.pipeline();
    const steps = pl.steps.filter((s) => s.from === fromMaster);
    if (steps.length === 0) return [];

    // existing down-links from this record, keyed by target master → first code.
    const down = fromCode ? await this.linkRepo.find({ where: { fromMaster, fromCode } }) : [];
    const existingByMaster = new Map<string, string>();
    for (const l of down) if (!existingByMaster.has(l.toMaster)) existingByMaster.set(l.toMaster, l.toCode);

    return steps.map((s) => {
      const code = existingByMaster.get(s.to);
      return {
        to: s.to,
        label: s.label,
        relation: s.relation,
        ...(code ? { existing: { master: s.to, code } } : {}),
      };
    });
  }

  /** Lineage: documents linked to (entityType, code), both directions. */
  async links(master: string, code: string): Promise<RelatedDoc[]> {
    const down = await this.linkRepo.find({ where: { fromMaster: master, fromCode: code } });
    const up = await this.linkRepo.find({ where: { toMaster: master, toCode: code } });
    return [
      ...down.map((l) => ({ master: l.toMaster, code: l.toCode, relation: l.relation, direction: 'down' as const })),
      ...up.map((l) => ({ master: l.fromMaster, code: l.fromCode, relation: l.relation, direction: 'up' as const })),
    ];
  }

  /** Create the next document from a source record, mapping fields + linking. */
  async createNext(
    fromMaster: string,
    fromCode: string,
    toMaster: string,
    actorUserId: string,
  ): Promise<{ master: string; code: string }> {
    const pl = await this.pipeline();
    const step = pl.steps.find((s) => s.from === fromMaster && s.to === toMaster);
    if (!step) throw new BadRequestError(`no pipeline step ${fromMaster} → ${toMaster}`);

    // Gate: the source's workflow state must allow creating the next document.
    if (!(await workflowService.canCreateNext(fromMaster, fromCode))) {
      throw new BadRequestError(`${fromCode} cannot create ${toMaster} in its current state`);
    }

    const fromReg = await this.registry.findOne({ slug: fromMaster });
    const targetReg = await this.registry.findOne({ slug: toMaster });
    if (!targetReg) throw new NotFoundError(`master not found: ${toMaster}`);

    // Source data — from the document table or master_data depending on kind.
    let sourceData: Record<string, unknown>;
    if (fromReg?.kind === 'document') {
      sourceData = (await documentDataService.getByCode(fromMaster, fromCode)).data;
    } else {
      const source = await this.data.findOne({ masterSlug: fromMaster, code: fromCode });
      if (!source) throw new NotFoundError('source document not found');
      sourceData = source.data;
    }

    const mapped = this.mapFields(step, sourceData);
    // Create the target draft in the right store.
    let code: string;
    if (targetReg.kind === 'document') {
      code = (await documentDataService.createDraft(toMaster, mapped)).code;
    } else {
      code = (await namingSeriesService.next(toMaster)) ?? (await this.nextCode(toMaster, step));
      mapped[targetReg.codeField] = code;
      await this.data.save(this.data.create({ masterSlug: toMaster, code, data: mapped, status: 'active', state: null }));
    }
    await this.linkRepo.save(
      this.linkRepo.create({ fromMaster, fromCode, toMaster, toCode: code, relation: step.relation }),
    );

    await activityService.addTimeline(fromMaster, fromCode, 'created', `Created ${targetReg.name} ${code}`, actorUserId);
    await activityService.addTimeline(toMaster, code, 'created', `Created from ${fromMaster} ${fromCode}`, actorUserId);
    return { master: toMaster, code };
  }

  private mapFields(step: PipelineStep, source: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [srcField, tgtField] of Object.entries(step.map)) {
      if (source[srcField] !== undefined) out[tgtField] = source[srcField];
    }
    return out;
  }

  private async nextCode(master: string, step: PipelineStep): Promise<string> {
    const count = await this.data.count({ masterSlug: master });
    return `${step.codePrefix}${String(count + 1).padStart(4, '0')}`;
  }
}

export const documentService = new DocumentService();
