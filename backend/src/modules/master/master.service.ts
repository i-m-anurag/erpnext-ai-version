import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { cache } from '../../shared/cache/cache.service.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { configResolver } from '../config/index.js';
import { validateFormData, FORM_RESOURCE_TYPE, type FormDefinition } from '../form/index.js';
import { namingSeriesService } from '../naming/index.js';
import { tableNameForSlug } from '../document/table-name.js';
import { documentDataService } from '../document/document-data.service.js';
import { getFormController, type FormDoc } from '../form-logic/index.js';
import { ledgerService } from '../ledger/index.js';
import { accountService } from '../accounts/index.js';
import { MasterRegistry, type MasterManagedBy } from './master-registry.entity.js';
import { MasterData } from './master-data.entity.js';

export interface MasterRegistryDef {
  slug: string;
  name: string;
  managedBy: MasterManagedBy;
  editable: boolean;
  formSlug?: string | null;
  cacheTtlSeconds?: number;
  codeField?: string;
  labelField?: string;
  workflowSlug?: string | null;
  kind?: 'master' | 'document';
}

export interface MasterOption {
  value: string;
  label: string;
}

const optionsKey = (slug: string): string => `master:${slug}:options`;

/**
 * Masters whose options are served by a system table instead of master_data rows —
 * so a lookup can point at e.g. the Chart of Accounts without duplicating it into the
 * generic store (where it would go stale). Register a provider here rather than adding
 * a per-slug branch to the resolver.
 */
const OPTION_PROVIDERS: Record<string, () => Promise<MasterOption[]>> = {
  account: () => accountService.options(),
};

/**
 * Master registry + generic master-data store (§5.5). Rows for every master live
 * in one table; writes are validated against the master's form definition.
 */
export class MasterService {
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly data = new BaseRepository(MasterData);

  // ── Registry ────────────────────────────────────────────────────────────
  /** Registry list, each entry annotated with its active row count. */
  async list(): Promise<Array<MasterRegistry & { rowCount: number }>> {
    const regs = await this.registry.find({ order: { slug: 'ASC' } });
    return Promise.all(
      regs.map(async (r) => ({
        ...r,
        rowCount: await this.data.count({ masterSlug: r.slug, status: 'active' }),
      })),
    );
  }

  async getRegistry(slug: string): Promise<MasterRegistry> {
    const reg = await this.registry.findOne({ slug });
    if (!reg) throw new NotFoundError(`master not found: ${slug}`);
    return reg;
  }

  async upsertRegistry(def: MasterRegistryDef, manager?: EntityManager): Promise<MasterRegistry> {
    const repo = manager ? this.registry.withManager(manager) : this.registry;
    const existing = await repo.findOne({ slug: def.slug });
    const row = repo.create({
      ...(existing ?? {}),
      slug: def.slug,
      name: def.name,
      managedBy: def.managedBy,
      editable: def.editable,
      formSlug: def.formSlug ?? null,
      cacheTtlSeconds: def.cacheTtlSeconds ?? 3600,
      codeField: def.codeField ?? 'code',
      labelField: def.labelField ?? 'name',
      workflowSlug: def.workflowSlug ?? null,
      kind: def.kind ?? 'master',
      tableName: def.kind === 'document' ? tableNameForSlug(def.slug) : null,
      status: 'active',
    });
    return repo.save(row);
  }

  // ── Data ────────────────────────────────────────────────────────────────
  async listData(slug: string, limit = 100, offset = 0): Promise<MasterData[]> {
    const reg = await this.getRegistry(slug);
    if (reg.kind === 'document') {
      return documentDataService.list(slug, limit, offset) as unknown as Promise<MasterData[]>;
    }
    return this.data.find({
      where: { masterSlug: slug, status: 'active' },
      order: { code: 'ASC' },
      take: Math.min(limit, 500),
      skip: offset,
    });
  }

  /**
   * Fetch ONE record by its code, WITH line-items. List/options skip children for
   * speed, so the record screen loads the full record (incl. line-items) here.
   */
  async getRecord(slug: string, code: string): Promise<MasterData> {
    const reg = await this.getRegistry(slug);
    if (reg.kind === 'document') {
      return documentDataService.getByCode(slug, code) as unknown as MasterData;
    }
    const row = await this.data.findOne({ masterSlug: slug, code });
    if (!row) throw new NotFoundError('record not found');
    return row;
  }

  /** Dropdown options for a master (value=code, label=labelField), cached. */
  async getOptions(slug: string): Promise<MasterOption[]> {
    const reg = await this.getRegistry(slug);
    return cache.getOrBuild<MasterOption[]>(
      optionsKey(slug),
      async () => {
        const provider = OPTION_PROVIDERS[slug];
        if (provider) return provider();
        if (reg.kind === 'document') return documentDataService.options(slug);
        const rows = await this.data.find({ where: { masterSlug: slug, status: 'active' }, order: { code: 'ASC' } });
        return rows.map((r) => ({
          value: r.code,
          label: String(r.data[reg.labelField] ?? r.code),
        }));
      },
      { ttlSeconds: reg.cacheTtlSeconds },
    );
  }

  async createData(slug: string, input: Record<string, unknown>, draft = false): Promise<MasterData> {
    const reg = await this.getRegistry(slug);
    const controller = getFormController(slug);
    if (controller?.beforeSave) {
      const ctx = { slug, input: { ...input }, draft, isNew: true };
      await controller.beforeSave(ctx);
      input = ctx.input;
    }
    let saved: MasterData;
    if (reg.kind === 'document') {
      // Persist the document and run its afterSave (which posts to the ledger) in ONE
      // transaction, so a failed GL post rolls the document back — never a saved-but-
      // unposted ghost. draft → skip validation + 'draft'; submit → validate + 'active'.
      const finalInput = input;
      saved = await AppDataSource.transaction(async (mgr) => {
        const row = draft
          ? await documentDataService.createDraft(slug, finalInput, mgr)
          : await documentDataService.create(slug, finalInput, mgr);
        const s = row as unknown as MasterData;
        await this.runControllerAfterSave(reg, controller, s, mgr);
        return s;
      });
    } else {
      // Auto-generate the code from the naming series (if configured) — overrides any
      // user-supplied value so the id format is enforced.
      const auto = await namingSeriesService.next(slug);
      if (auto) input = { ...input, [reg.codeField]: auto };
      const { clean, code } = await this.prepareWrite(slug, input, { skipValidation: draft });
      if (await this.data.exists({ masterSlug: slug, code })) {
        throw new ConflictError(`${reg.name} with ${reg.codeField}="${code}" already exists`);
      }
      const status = draft ? 'draft' : 'active';
      saved = await this.data.save(this.data.create({ masterSlug: slug, code, data: clean, status }));
      await this.runControllerAfterSave(reg, controller, saved);
    }
    await cache.invalidate(optionsKey(slug));
    return saved;
  }

  async updateData(slug: string, id: string, input: Record<string, unknown>, draft = false): Promise<MasterData> {
    const reg = await this.getRegistry(slug);
    // A document that has posted to the ledger is immutable — editing it would let the
    // saved record drift from its (already-posted, append-only) GL entries. Reverse it
    // to make changes.
    if (reg.kind === 'document') {
      const existing = await documentDataService.getById(slug, id);
      if (await ledgerService.hasEntries(slug, existing.code)) {
        throw new BadRequestError('this document is posted to the ledger and is read-only; reverse it to make changes');
      }
    }
    const controller = getFormController(slug);
    if (controller?.beforeSave) {
      const ctx = { slug, input: { ...input }, draft, isNew: false };
      await controller.beforeSave(ctx);
      input = ctx.input;
    }
    let saved: MasterData;
    if (reg.kind === 'document') {
      // Persist + re-post atomically (see createData). draft/submit handled inside update().
      const finalInput = input;
      saved = await AppDataSource.transaction(async (mgr) => {
        const row = await documentDataService.update(slug, id, finalInput, { draft }, mgr);
        const s = row as unknown as MasterData;
        await this.runControllerAfterSave(reg, controller, s, mgr);
        return s;
      });
    } else {
      const existing = await this.data.findOne({ id, masterSlug: slug });
      if (!existing) throw new NotFoundError('master row not found');
      const { clean, code } = await this.prepareWrite(slug, input, { skipValidation: draft });
      if (code !== existing.code && (await this.data.exists({ masterSlug: slug, code }))) {
        throw new ConflictError(`another row already uses that code`);
      }
      existing.code = code;
      existing.data = clean;
      existing.status = draft ? 'draft' : 'active';
      saved = await this.data.save(existing);
      await this.runControllerAfterSave(reg, controller, saved);
    }
    await cache.invalidate(optionsKey(slug));
    return saved;
  }

  /**
   * Run the form controller's post-persist hooks: computeStatus derives the
   * business `state` (written via the right store for the kind), then afterSave
   * runs side effects. Mutates `saved.state` so the returned payload is current.
   */
  private async runControllerAfterSave(
    reg: MasterRegistry,
    controller: ReturnType<typeof getFormController>,
    saved: MasterData,
    mgr?: EntityManager,
  ): Promise<void> {
    if (!controller) return;
    const doc: FormDoc = { slug: reg.slug, id: saved.id, code: saved.code, data: saved.data, status: saved.status, state: saved.state };
    if (controller.computeStatus) {
      const next = controller.computeStatus(doc);
      if (next != null && next !== doc.state) {
        if (reg.kind === 'document') await documentDataService.setState(reg.slug, saved.id, next, mgr);
        else { saved.state = next; await this.data.save(saved); }
        saved.state = next;
        doc.state = next;
      }
    }
    if (controller.afterSave) await controller.afterSave(doc, { manager: mgr });
  }

  async deleteData(slug: string, id: string): Promise<void> {
    const reg = await this.getRegistry(slug);
    this.assertWritable(reg);
    if (reg.kind === 'document') {
      await documentDataService.remove(slug, id);
      await cache.invalidate(optionsKey(slug));
      return;
    }
    const existing = await this.data.findOne({ id, masterSlug: slug });
    if (!existing) throw new NotFoundError('master row not found');
    await this.data.softDelete(id);
    await cache.invalidate(optionsKey(slug));
  }

  /** Idempotently seed master rows (for seeded masters), bypassing the writable gate. */
  async seedData(slug: string, rows: Record<string, unknown>[]): Promise<number> {
    const reg = await this.getRegistry(slug);
    let changed = 0;
    for (const row of rows) {
      const code = String(row[reg.codeField] ?? '');
      if (!code) throw new Error(`master "${slug}" seed row missing code field "${reg.codeField}"`);
      const existing = await this.data.findOne({ masterSlug: slug, code });
      if (existing) {
        if (JSON.stringify(existing.data) !== JSON.stringify(row)) {
          existing.data = row;
          await this.data.save(existing);
          changed++;
        }
      } else {
        await this.data.save(this.data.create({ masterSlug: slug, code, data: row, status: 'active' }));
        changed++;
      }
    }
    if (changed) await cache.invalidate(optionsKey(slug));
    return changed;
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  private assertWritable(reg: MasterRegistry): void {
    if (reg.managedBy === 'seeded' || !reg.editable) {
      throw new ForbiddenError(`master "${reg.slug}" is read-only`);
    }
  }

  /** Shared create/update prep: gate, resolve form, validate, extract code.
   *  `skipValidation` (draft saves) bypasses field validation but still needs a code. */
  private async prepareWrite(
    slug: string,
    input: Record<string, unknown>,
    opts: { skipValidation?: boolean } = {},
  ): Promise<{ reg: MasterRegistry; clean: Record<string, unknown>; code: string }> {
    const reg = await this.getRegistry(slug);
    this.assertWritable(reg);
    if (!reg.formSlug) throw new BadRequestError(`master "${slug}" has no form to validate against`);

    const form = await configResolver.resolve<FormDefinition>(FORM_RESOURCE_TYPE, reg.formSlug);
    const clean = opts.skipValidation ? input : validateFormData(form.definition, input);
    const code = String(clean[reg.codeField] ?? '');
    if (!code) throw new BadRequestError(`missing required field "${reg.codeField}"`);
    return { reg, clean, code };
  }
}

export const masterService = new MasterService();
