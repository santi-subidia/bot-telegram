import { z } from "zod";

// ============================================
// Zod Schemas — Validación en runtime de lo que viene del LLM
// ============================================

/**
 * Schema para items de materiales estimados.
 * Los campos numéricos pueden venir como string desde el LLM,
 * Zod los coerce a number.
 */
export const MaterialEstimadoSchema = z.object({
	producto: z.string().min(1, "El nombre del producto no puede estar vacío"),
	precio: z.coerce.number().positive("El precio debe ser positivo"),
});

/**
 * Schema para items de gastos adicionales.
 * Mismo tratamiento de coerción para monto.
 */
export const GastoAdicionalSchema = z.object({
	concepto: z.string().min(1, "El concepto no puede estar vacío"),
	monto: z.coerce.number().positive("El monto debe ser positivo"),
});

/**
 * Schema para los datos extraídos del mensaje del usuario.
 * Todos los campos son opcionales porque el LLM solo envía lo que pudo extraer.
 * Los campos numéricos se coercen de string a number.
 * Los arrays nullable se manejan explícitamente.
 */
export const ExtractedDataSchema = z.object({
	clienteNombreCompleto: z.string().nullable().optional(),
	clienteContacto: z.string().nullable().optional(),
	descripcionTrabajo: z.string().nullable().optional(),
	duracionEstimada: z.string().nullable().optional(),
	materialEstimado: z.array(MaterialEstimadoSchema).nullable().optional(),
	valorManoObra: z.coerce.number().nullable().optional(),
	gastosAdicionales: z.array(GastoAdicionalSchema).nullable().optional(),
	fechaVencimiento: z.string().nullable().optional(),
	estadoFlujo: z
		.enum(["RECOPILANDO_DATOS", "LISTO_PARA_CONFIRMAR", "CONFIRMADO"])
		.optional(),
});

/**
 * Schema para la respuesta completa del LLM.
 * Esto es lo que оба providers deben cumplir.
 */
export const LLMResponseSchema = z.object({
	message: z.string().min(1, "El mensaje no puede estar vacío"),
	extractedData: ExtractedDataSchema,
});

// ============================================
// Tipos derivados de los schemas
// ============================================

export type MaterialEstimado = z.infer<typeof MaterialEstimadoSchema>;
export type GastoAdicional = z.infer<typeof GastoAdicionalSchema>;
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

// ============================================
// Estado del flujo del bot
// ============================================

export type EstadoFlujo =
	| "RECOPILANDO_DATOS"
	| "LISTO_PARA_CONFIRMAR"
	| "CONFIRMADO";

// ============================================
// Interfaz principal del estado del comprobante
// Se usa en la sesión de grammY. Los campos coinciden
// con el schema, pero con tipos TS nativos (no Zod infer).
// ============================================

export interface ComprobanteState {
	// Datos del Cliente
	clienteNombreCompleto: string | null;
	clienteContacto: string | null;

	// Detalles del Trabajo
	descripcionTrabajo: string | null;
	duracionEstimada: string | null;

	// Desglose Económico
	materialEstimado: MaterialEstimado[] | null;
	valorManoObra: number | null;
	gastosAdicionales: GastoAdicional[] | null;

	// Fechas (en formato ISO 8601)
	fechaCreacion: string;
	fechaVencimiento: string | null;

	// Control de flujo del bot
	estadoFlujo: EstadoFlujo;
}

// ============================================
// Estructura de la sesión en grammY
// ============================================

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface SessionData {
	historialChat: ChatMessage[];
	comprobanteActual: ComprobanteState;
}

// ============================================
// Tipos para el adapter pattern del LLM
// ============================================

export type LLMProviderName = "gemini" | "openai" | "nvidia";
