import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { cache } from '../../shared/cache/cache.service.js';
import { registerResourceType, isResourceTypeRegistered } from './resource-type.registry.js';
import { configResolver } from './config-resolver.service.js';
import { ConfigResource } from './config-resource.entity.js';

const SLUG = '__it-vendor-onboarding';
const TYPE = 'form';

const FormSchema = z.object({
  slug: z.string(),
  title: z.string(),
  layout: z.string(),
  fields: z.array(z.object({ key: z.string(), type: z.string(), label: z.string(), required: z.boolean().optional() })),
});

describe('config-resolution pipeline (integration)', () => {
  beforeAll(async () => {
    if (!isResourceTypeRegistered(TYPE)) {
      registerResourceType(TYPE, { schema: FormSchema, arrayMergeKeys: { fields: 'key' }, ttlSeconds: 60 });
    }
    await AppDataSource.initialize();
    await connectRedis();
    const repo = AppDataSource.getRepository(ConfigResource);
    await repo.delete({ resourceType: TYPE, slug: SLUG });
    await redis.del(`cfg:${TYPE}:${SLUG}`);

    await configResolver.upsert(TYPE, SLUG, 'base', {
      slug: SLUG,
      title: 'Vendor Onboarding',
      layout: 'single-column',
      fields: [
        { key: 'vendorName', type: 'text', label: 'Vendor Name', required: true },
        { key: 'gstin', type: 'text', label: 'GSTIN' },
      ],
    });
  });

  afterAll(async () => {
    await AppDataSource.getRepository(ConfigResource).delete({ resourceType: TYPE, slug: SLUG });
    await redis.del(`cfg:${TYPE}:${SLUG}`);
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('resolves base-only when no override exists', async () => {
    const eff = await configResolver.resolve<z.infer<typeof FormSchema>>(TYPE, SLUG);
    expect(eff.resolvedFrom).toBe('base');
    expect(eff.definition.title).toBe('Vendor Onboarding');
  });

  it('merges base + override (override wins; fields merge by key; new appended)', async () => {
    await configResolver.upsert(TYPE, SLUG, 'custom', {
      title: 'Supplier Onboarding',
      layout: 'two-column',
      fields: [
        { key: 'gstin', type: 'text', label: 'GST Number', required: true },
        { key: 'category', type: 'select', label: 'Category' },
      ],
    });
    const eff = await configResolver.resolve<z.infer<typeof FormSchema>>(TYPE, SLUG);
    expect(eff.resolvedFrom).toBe('merged');
    expect(eff.definition.title).toBe('Supplier Onboarding');
    const byKey = Object.fromEntries(eff.definition.fields.map((f) => [f.key, f]));
    expect(eff.definition.fields.length).toBe(3);
    expect(byKey.gstin!.label).toBe('GST Number');
    expect(byKey.vendorName!.label).toBe('Vendor Name');
    expect(eff.definition.fields[0]!.key).toBe('vendorName');
  });

  it('caches the resolved value and invalidates on write', async () => {
    await configResolver.resolve(TYPE, SLUG);
    expect(await redis.get(`cfg:${TYPE}:${SLUG}`)).toBeTruthy();
    await configResolver.upsert(TYPE, SLUG, 'custom', {
      title: 'Supplier Onboarding v2',
      layout: 'two-column',
      fields: [{ key: 'category', type: 'select', label: 'Category' }],
    });
    expect(await redis.get(`cfg:${TYPE}:${SLUG}`)).toBeNull();
    const eff = await configResolver.resolve<z.infer<typeof FormSchema>>(TYPE, SLUG);
    expect(eff.version).toBe(2);
    expect(eff.definition.title).toBe('Supplier Onboarding v2');
  });

  it('protects against cache stampede (concurrent misses → one build)', async () => {
    const key = '__it-stampede';
    await redis.del(key, `${key}:lock`);
    let builds = 0;
    const build = async (): Promise<{ n: number }> => {
      builds++;
      await new Promise((r) => setTimeout(r, 150));
      return { n: 42 };
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.getOrBuild(key, build, { ttlSeconds: 30 })),
    );
    expect(results.every((r) => r.n === 42)).toBe(true);
    expect(builds).toBe(1);
    await redis.del(key, `${key}:lock`);
  });
});
