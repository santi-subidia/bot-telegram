import { ExtractedDataSchema } from "../types";
import type { ComprobanteState, MaterialEstimado, GastoAdicional } from "../types";

/**
 * Valida los datos extraídos por el LLM usando Zod,
 * y luego sanitiza los que pasaron la validación.
 *
 * Capas de defensa:
 * 1. El provider ya forzó structured output (responseSchema / zodResponseFormat)
 * 2. El provider ya hizo Zod.parse como safetynet
 * 3. Esta función sanitiza strings, limpia monedas, y normaliza
 */
export function sanitizarDatosExtraidos(
  data: Record<string, unknown> | Partial<ComprobanteState>,
): Partial<ComprobanteState> {
  // Normalizar a Record para que Zod pueda parsear cualquier input
  const raw = data as Record<string, unknown>;

  // Capa 1: validar con Zod (coerce maneja strings numéricos)
  const parsed = ExtractedDataSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[Validation] ExtractedData Zod validation failed:",
      parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    );
    // No descartamos todo — usamos lo que podamos del raw
    return sanitizarRaw(raw);
  }

  const validated = parsed.data;

  // Capa 2: sanitizar strings y normalizar
  const resultado: Partial<ComprobanteState> = {};

  if (validated.clienteNombreCompleto !== undefined) {
    resultado.clienteNombreCompleto = validated.clienteNombreCompleto?.trim() ?? null;
  }
  if (validated.clienteContacto !== undefined) {
    resultado.clienteContacto = validated.clienteContacto?.trim() ?? null;
  }
  if (validated.descripcionTrabajo !== undefined) {
    resultado.descripcionTrabajo = validated.descripcionTrabajo?.trim() ?? null;
  }
  if (validated.duracionEstimada !== undefined) {
    resultado.duracionEstimada = validated.duracionEstimada?.trim() ?? null;
  }

  // valorManoObra: Zod ya coerció a number, pero sanitizamos símbolos por las dudas
  if (validated.valorManoObra !== undefined) {
    resultado.valorManoObra = validated.valorManoObra;
  }

  // materialEstimado: filtrar items con precio inválido
  if (validated.materialEstimado !== undefined) {
    resultado.materialEstimado = (validated.materialEstimado ?? [])
      .filter((item) => item.producto.trim() !== "" && item.precio > 0)
      .map((item) => ({
        producto: item.producto.trim(),
        precio: item.precio,
      }));
  }

  // gastosAdicionales: filtrar items con monto inválido
  if (validated.gastosAdicionales !== undefined) {
    resultado.gastosAdicionales = (validated.gastosAdicionales ?? [])
      .filter((item) => item.concepto.trim() !== "" && item.monto > 0)
      .map((item) => ({
        concepto: item.concepto.trim(),
        monto: item.monto,
      }));
  }

  if (validated.fechaVencimiento !== undefined) {
    resultado.fechaVencimiento = validated.fechaVencimiento;
  }

  if (validated.estadoFlujo !== undefined) {
    resultado.estadoFlujo = validated.estadoFlujo;
  }

  return resultado;
}

/**
 * Fallback: sanitiza datos raw cuando Zod falla.
 * Extrae lo que pueda y descarta lo inválido.
 */
function sanitizarRaw(data: Record<string, unknown>): Partial<ComprobanteState> {
  const resultado: Partial<ComprobanteState> = {};

  if (typeof data["clienteNombreCompleto"] === "string") {
    resultado.clienteNombreCompleto = data["clienteNombreCompleto"].trim() || null;
  }
  if (typeof data["clienteContacto"] === "string") {
    resultado.clienteContacto = data["clienteContacto"].trim() || null;
  }
  if (typeof data["descripcionTrabajo"] === "string") {
    resultado.descripcionTrabajo = data["descripcionTrabajo"].trim() || null;
  }
  if (typeof data["duracionEstimada"] === "string") {
    resultado.duracionEstimada = data["duracionEstimada"].trim() || null;
  }

  resultado.valorManoObra = parsearNumero(data["valorManoObra"]);

  if (Array.isArray(data["materialEstimado"])) {
    resultado.materialEstimado = data["materialEstimado"]
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        producto: String(item["producto"] ?? "").trim(),
        precio: parsearNumero(item["precio"]) ?? 0,
      }))
      .filter((item): item is MaterialEstimado => item.producto !== "" && item.precio > 0);
  }

  if (Array.isArray(data["gastosAdicionales"])) {
    resultado.gastosAdicionales = data["gastosAdicionales"]
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        concepto: String(item["concepto"] ?? "").trim(),
        monto: parsearNumero(item["monto"]) ?? 0,
      }))
      .filter((item): item is GastoAdicional => item.concepto !== "" && item.monto > 0);
  }

  if (typeof data["fechaVencimiento"] === "string" || data["fechaVencimiento"] === null) {
    resultado.fechaVencimiento = data["fechaVencimiento"] as string | null;
  }

  if (
    data["estadoFlujo"] === "RECOPILANDO_DATOS" ||
    data["estadoFlujo"] === "LISTO_PARA_CONFIRMAR" ||
    data["estadoFlujo"] === "CONFIRMADO"
  ) {
    resultado.estadoFlujo = data["estadoFlujo"];
  }

  return resultado;
}

/**
 * Parsea un valor que puede ser número, string con símbolos de moneda, o null.
 * Ejemplos: "$1.500" -> 1500, "1500" -> 1500, 1500 -> 1500
 */
function parsearNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return isNaN(valor) ? null : valor;

  // Normalizar strings: quitar $, €, puntos de miles, comas
  const limpio = String(valor)
    .replace(/[ $€¥£]/g, "")
    .replace(/\.(?=\d{3}[,.])/g, "")
    .replace(",", ".");

  const numero = Number(limpio);
  return isNaN(numero) ? null : numero;
}

/**
 * Determina si el comprobante tiene los datos mínimos para pasar a LISTO_PARA_CONFIRMAR.
 * Campos obligatorios: nombre del cliente, descripción del trabajo, valorManoObra y
 * al menos un material o gasto adicional.
 */
export function estaListoParaConfirmar(state: ComprobanteState): boolean {
  const tieneCliente = state.clienteNombreCompleto !== null && state.clienteNombreCompleto.trim() !== "";
  const tieneDescripcion = state.descripcionTrabajo !== null && state.descripcionTrabajo.trim() !== "";
  const tieneManoObra = state.valorManoObra !== null;
  const tieneItems =
    (state.materialEstimado !== null && state.materialEstimado.length > 0) ||
    (state.gastosAdicionales !== null && state.gastosAdicionales.length > 0);

  return tieneCliente && tieneDescripcion && tieneManoObra && tieneItems;
}

/**
 * Genera un resumen formateado del presupuesto para enviar al usuario.
 */
export function generarResumen(state: ComprobanteState): string {
  const lineas: string[] = [];

  lineas.push("📋 *PRESUPUESTO*");
  lineas.push("");

  if (state.clienteNombreCompleto) {
    lineas.push(`👤 Cliente: ${state.clienteNombreCompleto}`);
  }
  if (state.clienteContacto) {
    lineas.push(`📱 Contacto: ${state.clienteContacto}`);
  }
  lineas.push("");

  if (state.descripcionTrabajo) {
    lineas.push(`🔧 Trabajo: ${state.descripcionTrabajo}`);
  }
  if (state.duracionEstimada) {
    lineas.push(`⏱ Duración: ${state.duracionEstimada}`);
  }
  lineas.push("");

  // Materiales
  if (state.materialEstimado && state.materialEstimado.length > 0) {
    lineas.push("*Materiales:*");
    for (const mat of state.materialEstimado) {
      lineas.push(`  • ${mat.producto}: $${mat.precio.toFixed(2)}`);
    }
    lineas.push("");
  }

  // Mano de obra
  if (state.valorManoObra !== null) {
    lineas.push(`👷 Mano de obra: $${state.valorManoObra.toFixed(2)}`);
  }

  // Gastos adicionales
  if (state.gastosAdicionales && state.gastosAdicionales.length > 0) {
    lineas.push("");
    lineas.push("*Gastos adicionales:*");
    for (const gasto of state.gastosAdicionales) {
      lineas.push(`  • ${gasto.concepto}: $${gasto.monto.toFixed(2)}`);
    }
  }

  // Total
  const totalMateriales =
    state.materialEstimado?.reduce((acc, m) => acc + m.precio, 0) ?? 0;
  const totalGastos =
    state.gastosAdicionales?.reduce((acc, g) => acc + g.monto, 0) ?? 0;
  const manoObra = state.valorManoObra ?? 0;
  const total = totalMateriales + totalGastos + manoObra;

  lineas.push("");
  lineas.push(`💰 *Total: $${total.toFixed(2)}*`);

  if (state.fechaVencimiento) {
    const fecha = new Date(state.fechaVencimiento);
    if (!isNaN(fecha.getTime())) {
      lineas.push(`📅 Vencimiento: ${fecha.toLocaleDateString("es-AR")}`);
    } else {
      lineas.push(`📅 Vencimiento: ${state.fechaVencimiento}`);
    }
  }

  lineas.push("");
  lineas.push("¿Confirmás este presupuesto? Respondé *sí* o *no*.");

  return lineas.join("\n");
}