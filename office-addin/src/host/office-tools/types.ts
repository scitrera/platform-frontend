/**
 * Shared types for Office host tool definitions.
 */

/** JSON Schema (subset) describing a tool's input parameters. */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

/**
 * A locally-executable tool registered with tools-wss.
 * The handler is never sent over the wire — only name/description/jsonSchema
 * are sent to the server via tools/register.
 */
export interface LocalToolDef {
  name: string;
  description: string;
  jsonSchema: JsonSchemaObject;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
