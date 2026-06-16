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
});

export type ConditionValue = string | number | boolean | null;
export const conditionValueSchema: z.ZodType<ConditionValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

/** A single field comparison. Conditions in a branch are ANDed. */
export const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['==', '!=', '<', '<=', '>', '>=']),
  value: conditionValueSchema,
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
  }),
]);

/** if (conditions ANDed) → actions. An empty `conditions` array = the else branch. */
export const branchSchema = z.object({
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
  }),
  branches: z.array(branchSchema).default([]),
});

export const workflowDefinitionSchema = z.object({
  slug: z.string().min(1),
  appliesTo: z.string().min(1),
  startState: z.string().min(1),
  states: z.array(workflowStateSchema).min(1),
  rules: z.array(ruleSchema).default([]),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type RuleBranch = z.infer<typeof branchSchema>;
export type RuleAction = z.infer<typeof actionSchema>;
export type Condition = z.infer<typeof conditionSchema>;
