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
  /**
   * Offer this step only when a source field holds one of these values. Lets one
   * document branch by purpose — a Material Request goes to a Purchase Order when it
   * is a Purchase, and to a Stock Entry when it is an Issue or Transfer. Absent → the
   * step always applies.
   */
  when: z.object({ field: z.string().min(1), in: z.array(z.string()).min(1) }).optional(),
  /** prefix for the generated code of the new document, e.g. "PINV-2026-" */
  codePrefix: z.string().default(''),
  /** sourceField → targetField copy map (top-level scalar fields) */
  map: z.record(z.string(), z.string()).default({}),
  /**
   * Line-item carry-over. Documents in a chain legitimately name their line table and
   * columns differently (a Purchase Order has `lines[].qty`, a Receipt has
   * `items[].quantity`), so the rows are copied column-by-column rather than wholesale.
   * Target columns with no mapping (e.g. the receiving `warehouse`) are simply left for
   * the user to fill on the new document.
   */
  lineMap: z
    .object({
      from: z.string().min(1),
      to: z.string().min(1),
      columns: z.record(z.string(), z.string()).default({}),
    })
    .optional(),
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
