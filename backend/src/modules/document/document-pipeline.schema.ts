import { z } from 'zod';
import { registerResourceType } from '../config/index.js';

/**
 * The macro pipeline: which document creates which next document. Backend-config
 * (seeded), so the SEQUENCE is fixed — users can't reorder it; they only edit the
 * per-document workflow rules. Each step maps source fields → target fields and
 * names the lineage relation.
 */
export const pipelineStepSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1),
  relation: z.string().min(1),
  /** prefix for the generated code of the new document, e.g. "PINV-2026-" */
  codePrefix: z.string().default(''),
  /** sourceField → targetField copy map */
  map: z.record(z.string(), z.string()).default({}),
});

export const pipelineSchema = z.object({
  slug: z.string().min(1),
  steps: z.array(pipelineStepSchema).default([]),
});

export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;

export const DOCUMENT_PIPELINE_RESOURCE_TYPE = 'document_pipeline';

export function registerPipelineResourceType(): void {
  registerResourceType(DOCUMENT_PIPELINE_RESOURCE_TYPE, {
    schema: pipelineSchema,
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}
