import { zodToJsonSchema } from "zod-to-json-schema";
import { LLMResponseSchema } from "../../types";

/**
 * JSON Schema derivado del Zod schema para uso genérico.
 * Se usa como base para configurar structured outputs en ambos providers.
 */
export const llmResponseJsonSchema: Record<string, unknown> = zodToJsonSchema(LLMResponseSchema, {
  target: "openApi3",
}) as Record<string, unknown>;

/**
 * Genera el JSON Schema para OpenAI Structured Outputs.
 * Usado como response_format con type: "json_schema".
 *
 * Nota: OpenAI requiere que el schema tenga name, strict: true,
 * y additionalProperties: false en el nivel raíz.
 */
export function getOpenAIJsonSchema(): Record<string, unknown> {
  const schema = llmResponseJsonSchema;
  const properties = (schema as Record<string, unknown>)["properties"] ?? {};
  const required = (schema as Record<string, unknown>)["required"] ?? [];
  return {
    type: "json_schema",
    json_schema: {
      name: "budget_response",
      strict: true,
      schema: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}