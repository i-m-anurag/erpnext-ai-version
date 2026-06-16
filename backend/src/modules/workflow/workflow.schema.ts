import { z } from 'zod';

/**
 * Workflow definition (ERPNext-style): named states + role/condition-gated
 * transitions over a master's `state` field. Stored as a config resource
 * (base + custom), so it's seeded as a default and editable from the UI.
 */
export const workflowStateSchema = z.object({
  name: z.string().min(1),
  /** chip style hint: secondary | warning | success | danger | info */
  color: z.string().optional(),
});

export const workflowTransitionSchema = z.object({
  action: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** role codes allowed to perform this transition (empty = any authenticated). */
  roles: z.array(z.string()).default([]),
  /** optional guard over the record, e.g. "doc.total <= 100000". null = always. */
  condition: z.string().nullable().optional(),
});

export const workflowDefinitionSchema = z.object({
  slug: z.string().min(1),
  appliesTo: z.string().min(1),
  startState: z.string().min(1),
  states: z.array(workflowStateSchema).min(1),
  transitions: z.array(workflowTransitionSchema),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;
export type WorkflowState = z.infer<typeof workflowStateSchema>;
