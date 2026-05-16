import axios, { type AxiosRequestConfig } from "axios";
import type { LLMProvider } from "../llm.interface";
import type { ChatMessage, ComprobanteState } from "../../../types";
import { LLMResponseSchema } from "../../../types";
import type { LLMResponse } from "../../../types";
import { SYSTEM_PROMPT } from "../../../prompts/system.prompt";
import { buildExtractionPrompt } from "../../../prompts/extraction.prompt";

const THINK_REGEX = /<think>[\s\S]*?<\/think>/g;
const CODE_BLOCK_REGEX = /```json\s*([\s\S]*?)\s*```/g;

/**
 * Adapter para NVIDIA NIM (API compatible con OpenAI).
 * Usa axios directamente porque NVIDIA NIM no soporta response_format: json_object
 * y el SDK de OpenAI no permite pasar chat_template_kwargs para Kimi K2.6.
 *
 * Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 * Modelos soportados: moonshotai/kimi-k2.6, minimaxai/minimax-m2.7, etc.
 */
export class NVIDIAProvider implements LLMProvider {
	readonly name = "nvidia";
	private readonly apiKey: string;
	private readonly model: string;

	constructor(apiKey: string, model = "moonshotai/kimi-k2.6") {
		this.apiKey = apiKey;
		this.model = model;
	}

	async chat(
		history: ChatMessage[],
		currentState: ComprobanteState,
	): Promise<LLMResponse> {
		const extractionInstruction = buildExtractionPrompt(currentState);

		const messages = [
			{ role: "system" as const, content: SYSTEM_PROMPT },
			...history.map((msg) => ({
				role: msg.role as "user" | "assistant",
				content: msg.content,
			})),
			{ role: "user" as const, content: extractionInstruction },
		];

		const payload = {
			model: this.model,
			messages,
			max_tokens: 16384,
			temperature: 0.7,
			top_p: 0.95,
		};

		const config: AxiosRequestConfig = {
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
		};

		const response = await axios.post(
			"https://integrate.api.nvidia.com/v1/chat/completions",
			payload,
			config,
		);

		const content: string =
			response.data.choices?.[0]?.message?.content ?? "{}";
		return this.parseAndValidate(content);
	}

	/**
	 * Parsea y valida la respuesta del LLM.
	 * NVIDIA NIM no fuerza JSON, asi que el modelo puede devolver:
	 * 1. JSON puro: { message: "...", extractedData: {...} }
	 * 2. JSON envuelto en markdown code block
	 * 3. Texto plano sin JSON (el modelo ignora la instruccion)
	 * 4. Texto con razonamiento al inicio (Kimi thinking mode)
	 */
	private parseAndValidate(raw: string): LLMResponse {
		let text = raw.trim();

		// 1. Quitar bloques de razonamiento (Kimi thinking mode)
		text = text.replace(THINK_REGEX, "").trim();

		// 2. Intentar extraer JSON de markdown code blocks
		//    Usar matchAll para encontrar todos y tomar el ultimo
		const codeBlockMatches = [...text.matchAll(CODE_BLOCK_REGEX)];
		if (codeBlockMatches.length > 0) {
			const lastMatch = codeBlockMatches[codeBlockMatches.length - 1]!;
			const parsed = this.tryParseJson(lastMatch[1]!);
			if (parsed) return parsed;
		}

		// 3. Intentar encontrar un objeto JSON {...} en el texto
		//    Buscar el primer { y ultimo } que formen un JSON valido
		const jsonStart = text.indexOf("{");
		const jsonEnd = text.lastIndexOf("}");
		if (jsonStart !== -1 && jsonEnd > jsonStart) {
			const candidate = text.substring(jsonStart, jsonEnd + 1);
			const parsed = this.tryParseJson(candidate);
			if (parsed) return parsed;
		}

		// 4. Fallback: texto plano, devolver como mensaje sin datos extraidos
		console.warn(
			"[NVIDIAProvider] No se encontro JSON valido en la respuesta, usando texto como mensaje",
		);
		return { message: text, extractedData: {} };
	}

	/**
	 * Intenta parsear un string como JSON, validarlo con Zod,
	 * y devolver un LLMResponse. Retorna null si falla.
	 */
	private tryParseJson(jsonStr: string): LLMResponse | null {
		try {
			const parsed = JSON.parse(jsonStr);

			// Validacion con Zod
			const validated = LLMResponseSchema.safeParse(parsed);
			if (validated.success) {
				return validated.data;
			}

			// Si Zod falla pero tiene "message", extraer lo que podamos
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"message" in parsed
			) {
				return {
					message:
						typeof parsed.message === "string"
							? parsed.message
							: JSON.stringify(parsed),
					extractedData:
						typeof parsed.extractedData === "object" &&
						parsed.extractedData !== null
							? (parsed.extractedData as Partial<ComprobanteState>)
							: {},
				};
			}
		} catch {
			// No es JSON valido, retorna null para que el caller intente otra estrategia
		}
		return null;
	}
}
