import type { ComprobanteState } from "../types";

/**
 * Construye el prompt de extracción que se envía al LLM junto con cada mensaje.
 * Le indica al modelo qué datos ya tiene y cuáles faltan, para que
 * solo extraiga lo nuevo y genere la respuesta conversacional.
 */
export function buildExtractionPrompt(currentState: ComprobanteState): string {
  const missingFields: string[] = [];

  if (!currentState.clienteNombreCompleto) missingFields.push("nombre completo del cliente");
  if (!currentState.clienteContacto) missingFields.push("contacto del cliente (teléfono o email)");
  if (!currentState.descripcionTrabajo) missingFields.push("descripción del trabajo");
  if (!currentState.duracionEstimada) missingFields.push("duración estimada del trabajo");
  if (!currentState.materialEstimado || currentState.materialEstimado.length === 0)
    missingFields.push("materiales estimados (producto y precio)");
  if (currentState.valorManoObra === null) missingFields.push("valor de la mano de obra");
  if (!currentState.gastosAdicionales || currentState.gastosAdicionales.length === 0)
    missingFields.push("gastos adicionales (opcional)");
  if (!currentState.fechaVencimiento) missingFields.push("fecha de vencimiento del presupuesto");

  const stateSummary = JSON.stringify(currentState, null, 2);
  const missingStr =
    missingFields.length > 0
      ? `Datos que aún faltan: ${missingFields.join(", ")}.`
      : "Todos los datos están completos. Presentá el resumen para confirmación.";

  return `Estado actual del presupuesto:
${stateSummary}

${missingStr}

Analizá el último mensaje del usuario y extraé cualquier dato nuevo. Respondé en JSON con "message" (tu respuesta al usuario) y "extractedData" (solo los campos nuevos que puedas extraer). Si elusuario está confirmando el presupuesto, Poné estadoFlujo en "CONFIRMADO".`;
}