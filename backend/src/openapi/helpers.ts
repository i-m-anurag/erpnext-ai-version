import { z, type ZodType } from 'zod';

/**
 * Convert a Zod schema to an OpenAPI 3.0 schema object. Use io='input' for
 * request bodies (defaulted/optional fields are not marked required) and
 * io='output' for responses. This keeps the API docs derived from the SAME Zod
 * schemas that validate requests — one source of truth (cross-cutting §7).
 */
export function toSchema(schema: ZodType, io: 'input' | 'output' = 'output'): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as Record<string, unknown>;
}

/** Reference to a registered component schema. */
export function ref(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

/** A JSON request body referencing a component schema. */
export function jsonBody(name: string, required = true): Record<string, unknown> {
  return { required, content: { 'application/json': { schema: ref(name) } } };
}

/** A JSON response referencing a component schema. */
export function jsonResponse(description: string, name: string): Record<string, unknown> {
  return { description, content: { 'application/json': { schema: ref(name) } } };
}

/** Standard error response referencing the shared Error schema. */
export function errorResponse(description: string): Record<string, unknown> {
  return jsonResponse(description, 'Error');
}
