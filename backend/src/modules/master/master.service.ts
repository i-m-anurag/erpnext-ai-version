import type { EntityManager } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { cache } from '../../shared/cache/cache.service.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { configResolver } from '../config/index.js';
import { validateFormData, FORM_RESOURCE_TYPE, type FormDefinition } from '../form/index.js';
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
}

export interface MasterOption {
  value: string;
  label: string;
}

const optionsKey = (slug: string): string => `master:${slug}:options`;

/**
 * Master registry + generic master-data store (§5.5). Rows for every master live
 * in one table; writes are validated against the master's form definition.
 */
export class MasterService {
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly data = new BaseRepository(MasterData);

  // ── Registry ────────────────────────────────────────────────────────────
  list(): Promise<MasterRegistry[]> {
    return this.registry.find({ order: { slug: 'ASC' } });
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
      status: 'active',
    });
    return repo.save(row);
  }

  // ── Data ────────────────────────────────────────────────────────────────
  async listData(slug: string, limit = 100, offset = 0): Promise<MasterData[]> {
    await this.getRegistry(slug);
    return this.data.find({
      where: { masterSlug: slug, status: 'active' },
      order: { code: 'ASC' },
      take: Math.min(limit, 500),
      skip: offset,
    });
  }

  /** Dropdown options for a master (value=code, label=labelField), cached. */
  async getOptions(slug: string): Promise<MasterOption[]> {
    const reg = await this.getRegistry(slug);
    return cache.getOrBuild<MasterOption[]>(
      optionsKey(slug),
      async () => {
        const rows = await this.data.find({ where: { masterSlug: slug, status: 'active' }, order: { code: 'ASC' } });
        return rows.map((r) => ({
          value: r.code,
          label: String(r.data[reg.labelField] ?? r.code),
        }));
      },
      { ttlSeconds: reg.cacheTtlSeconds },
    );
  }

  async createData(slug: string, input: Record<string, unknown>): Promise<MasterData> {
    const { reg, clean, code } = await this.prepareWrite(slug, input);
    if (await this.data.exists({ masterSlug: slug, code })) {
      throw new ConflictError(`${reg.name} with ${reg.codeField}="${code}" already exists`);
    }
    const saved = await this.data.save(this.data.create({ masterSlug: slug, code, data: clean, status: 'active' }));
    await cache.invalidate(optionsKey(slug));
    return saved;
  }

  async updateData(slug: string, id: string, input: Record<string, unknown>): Promise<MasterData> {
    const existing = await this.data.findOne({ id, masterSlug: slug });
    if (!existing) throw new NotFoundError('master row not found');
    const { clean, code } = await this.prepareWrite(slug, input);
    if (code !== existing.code && (await this.data.exists({ masterSlug: slug, code }))) {
      throw new ConflictError(`another row already uses that code`);
    }
    existing.code = code;
    existing.data = clean;
    const saved = await this.data.save(existing);
    await cache.invalidate(optionsKey(slug));
    return saved;
  }

  async deleteData(slug: string, id: string): Promise<void> {
    const reg = await this.getRegistry(slug);
    this.assertWritable(reg);
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

  /** Shared create/update prep: gate, resolve form, validate, extract code. */
  private async prepareWrite(
    slug: string,
    input: Record<string, unknown>,
  ): Promise<{ reg: MasterRegistry; clean: Record<string, unknown>; code: string }> {
    const reg = await this.getRegistry(slug);
    this.assertWritable(reg);
    if (!reg.formSlug) throw new BadRequestError(`master "${slug}" has no form to validate against`);

    const form = await configResolver.resolve<FormDefinition>(FORM_RESOURCE_TYPE, reg.formSlug);
    const clean = validateFormData(form.definition, input);
    const code = String(clean[reg.codeField] ?? '');
    if (!code) throw new BadRequestError(`missing required field "${reg.codeField}"`);
    return { reg, clean, code };
  }
}

export const masterService = new MasterService();
