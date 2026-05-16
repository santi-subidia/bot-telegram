import OpenAI from "openai";
import type { LLMProvider } from "../llm.interface";
import type { ChatMessage, ComprobanteState } from "../../../types";
import { LLMResponseSchema } from "../../../types";
import type { LLMResponse } from "../../../types";
import { SYSTEM_PROMPT } from "../../../prompts/system.prompt";
import { buildExtractionPrompt } from "../../../prompts/extraction.prompt";

/**
 * Adapter para OpenAI.
 * Usa response_format: json_object para garantizar JSON válido,
 * y luego valida con Zod en el cliente.
 *
 * Nota: zodResponseFormat + .parse() requiere OpenAI SDK v5+.
 * Para v4 (la actual), usamos json_object + validación Zod manual.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(
    history: ChatMessage[],
    currentState: ComprobanteState,
  ): Promise<LLMResponse> {
    const extractionInstruction = buildExtractionPrompt(currentState);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: extractionInstruction },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    return this.parseAndValidate(content);
  }

  /**
   * Parsea y valida con Zod. Si falla, hace fallback graceful.
   */
  private parseAndValidate(raw: string): LLMResponse {
    try {
      const parsed = JSON.parse(raw);
      const validated = LLMResponseSchema.parse(parsed);
      return validated;
    } catch (error) {
      console.warn(
        "[OpenAIProvider] Zod validation failed, falling back to raw parse:",
        error instanceof Error ? error.message : error,
      );
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
          message: typeof parsed["message"] === "string" ? parsed["message"] : raw,
          extractedData: typeof parsed["extractedData"] === "object" && parsed["extractedData"] !== null
            ? (parsed["extractedData"] as Partial<ComprobanteState>)
            : {},
        };
      } catch {
        return { message: raw, extractedData: {} };
      }
    }
  }
}