import type { LLMProvider } from "./llm.interface";
import type { LLMProviderName } from "../../types";
import { GeminiProvider } from "./providers/gemini.provider";
import { OpenAIProvider } from "./providers/openai.provider";

/**
 * Crea el provider de LLM según la configuración.
 * Cambiar LLM_PROVIDER en .env para intercambiar entre "gemini" y "openai".
 */
export function createLLMProvider(
  providerName: LLMProviderName,
  config: Record<string, string>,
): LLMProvider {
  switch (providerName) {
    case "gemini": {
      const apiKey = config["GEMINI_API_KEY"];
      if (!apiKey) throw new Error("GEMINI_API_KEY es requerida para el provider Gemini");
      const model = config["GEMINI_MODEL"] ?? "gemini-2.0-flash";
      return new GeminiProvider(apiKey, model);
    }

    case "openai": {
      const apiKey = config["OPENAI_API_KEY"];
      if (!apiKey) throw new Error("OPENAI_API_KEY es requerida para el provider OpenAI");
      const model = config["OPENAI_MODEL"] ?? "gpt-4o-mini";
      return new OpenAIProvider(apiKey, model);
    }

    default:
      throw new Error(`Provider no soportado: ${providerName}. Usar "gemini" o "openai".`);
  }
}