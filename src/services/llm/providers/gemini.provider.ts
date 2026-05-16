import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { LLMProvider } from "../llm.interface";
import type { ChatMessage, ComprobanteState, LLMResponse } from "../../../types";
import { LLMResponseSchema } from "../../../types";
import { SYSTEM_PROMPT } from "../../../prompts/system.prompt";
import { buildExtractionPrompt } from "../../../prompts/extraction.prompt";

/**
 * Adapter para Google Gemini.
 * Usa responseSchema con SchemaType para forzar structured outputs,
 * validando después con Zod como safetynet.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenerativeAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(
    history: ChatMessage[],
    currentState: ComprobanteState,
  ): Promise<LLMResponse> {
    const generativeModel = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            message: {
              type: SchemaType.STRING,
              description: "Respuesta conversacional al usuario",
              nullable: false,
            },
            extractedData: {
              type: SchemaType.OBJECT,
              properties: {
                clienteNombreCompleto: { type: SchemaType.STRING, nullable: true },
                clienteContacto: { type: SchemaType.STRING, nullable: true },
                descripcionTrabajo: { type: SchemaType.STRING, nullable: true },
                duracionEstimada: { type: SchemaType.STRING, nullable: true },
                materialEstimado: {
                  type: SchemaType.ARRAY,
                  nullable: true,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      producto: { type: SchemaType.STRING, nullable: false },
                      precio: { type: SchemaType.NUMBER, nullable: false },
                    },
                    required: ["producto", "precio"],
                  },
                },
                valorManoObra: { type: SchemaType.NUMBER, nullable: true },
                gastosAdicionales: {
                  type: SchemaType.ARRAY,
                  nullable: true,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      concepto: { type: SchemaType.STRING, nullable: false },
                      monto: { type: SchemaType.NUMBER, nullable: false },
                    },
                    required: ["concepto", "monto"],
                  },
                },
                fechaVencimiento: { type: SchemaType.STRING, nullable: true },
                estadoFlujo: { type: SchemaType.STRING, nullable: true },
              },
            },
          },
          required: ["message", "extractedData"],
        },
      },
    });

    // Historial en formato Gemini
    const geminiHistory = history.slice(0, -1).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user" as const,
      parts: [{ text: msg.content }],
    }));

    // El último mensaje del usuario incluye el prompt de extracción
    const extractionInstruction = buildExtractionPrompt(currentState);

    const chat = generativeModel.startChat({
      history: geminiHistory,
    });

    const result = await chat.sendMessage(extractionInstruction);
    const responseText = result.response.text();

    return this.parseAndValidate(responseText);
  }

  /**
   * Parsea el JSON de Gemini y valida con Zod.
   * Si la validación falla, hace fallback graceful.
   */
  private parseAndValidate(raw: string): LLMResponse {
    try {
      const parsed = JSON.parse(raw);
      const validated = LLMResponseSchema.parse(parsed);
      return validated;
    } catch (error) {
      console.warn(
        "[GeminiProvider] Zod validation failed, falling back to raw parse:",
        error instanceof Error ? error.message : error,
      );
      // Fallback: intentar extraer al menos el mensaje
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