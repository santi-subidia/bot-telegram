import type { ChatMessage, ComprobanteState, LLMResponse } from "../../types";

/**
 * Interfaz que debe implementar cada proveedor de LLM.
 * Permite intercambiar Gemini ↔ OpenAI cambiando solo la config.
 */
export interface LLMProvider {
  /** Nombre del proveedor para logging y debugging */
  readonly name: string;

  /**
   * Envía el historial de chat + estado actual al LLM y recibe:
   * - Un mensaje conversacional para el usuario
   * - Los datos estructurados extraídos del mensaje
   */
  chat(
    history: ChatMessage[],
    currentState: ComprobanteState,
  ): Promise<LLMResponse>;
}