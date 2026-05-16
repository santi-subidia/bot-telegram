import type { ChatMessage, ComprobanteState, LLMResponse, SessionData } from "../types";
import type { LLMProvider } from "./llm";
import { sanitizarDatosExtraidos, estaListoParaConfirmar, generarResumen } from "./validation.service";
import { parsearFechaVencimiento } from "../utils";

/**
 * Servicio principal de IA. Orquesta la comunicación con el LLM,
 * la actualización del estado y la lógica de flujo.
 */
export class AIService {
  constructor(private readonly provider: LLMProvider) {}

  /**
   * Procesa un mensaje del usuario:
   * 1. Envía el historial + estado al LLM
   * 2. Extrae y sanitiza los datos
   * 3. Actualiza el estado de la sesión
   * 4. Actualiza el estadoFlujo según corresponda
   * 5. Retorna el mensaje de respuesta y la sesión actualizada
   */
  async handleMessage(
    userMessage: string,
    session: SessionData,
  ): Promise<{ reply: string; updatedSession: SessionData }> {
    // Agregar mensaje del usuario al historial
    const historialActualizado: ChatMessage[] = [
      ...session.historialChat,
      { role: "user", content: userMessage },
    ];

    // Llamar al LLM
    let response: LLMResponse;
    try {
      response = await this.provider.chat(
        historialActualizado,
        session.comprobanteActual,
      );
    } catch (error) {
      const mensajeError =
        error instanceof Error ? error.message : "Error desconocido";
      console.error(`[AIService] Error llamando al LLM (${this.provider.name}):`, mensajeError);
      return {
        reply: "Ups, hubo un error al procesar tu mensaje. Intentá de nuevo en un momento.",
        updatedSession: {
          ...session,
          historialChat: historialActualizado,
        },
      };
    }

    // Sanitizar datos extraídos
    const datosSanitizados = sanitizarDatosExtraidos(response.extractedData);

    // Mergear datos en el comprobante
    const comprobanteActualizado = this.mergeComprobante(
      session.comprobanteActual,
      datosSanitizados,
    );

    // Parsear fechaVencimiento si viene en formato natural
    if (comprobanteActualizado.fechaVencimiento) {
      const fechaParseada = parsearFechaVencimiento(
        comprobanteActualizado.fechaVencimiento,
      );
      if (fechaParseada) {
        comprobanteActualizado.fechaVencimiento = fechaParseada;
      }
    }

    // Actualizar estadoFlujo si corresponde pasar a LISTO_PARA_CONFIRMAR
    // (solo si no fue gesetzt por el LLM explícitamente)
    if (comprobanteActualizado.estadoFlujo === "RECOPILANDO_DATOS") {
      if (estaListoParaConfirmar(comprobanteActualizado)) {
        comprobanteActualizado.estadoFlujo = "LISTO_PARA_CONFIRMAR";
      }
    }

    // Agregar respuesta del asistente al historial
    const historialFinal: ChatMessage[] = [
      ...historialActualizado,
      { role: "assistant", content: response.message },
    ];

    // Si está LISTO_PARA_CONFIRMAR, agregar el resumen
    let replyFinal = response.message;
    if (comprobanteActualizado.estadoFlujo === "LISTO_PARA_CONFIRMAR") {
      // Solo mostrar resumen si recién cambió el estado
      const estadoPrevio = session.comprobanteActual.estadoFlujo;
      if (estadoPrevio === "RECOPILANDO_DATOS") {
        replyFinal = `${response.message}\n\n${generarResumen(comprobanteActualizado)}`;
      }
    }

    return {
      reply: replyFinal,
      updatedSession: {
        historialChat: historialFinal,
        comprobanteActual: comprobanteActualizado,
      },
    };
  }

  /**
   * Mergea los datos extraídos en el comprobante actual,
   * respetando los campos null y los arrays.
   */
  private mergeComprobante(
    actual: ComprobanteState,
    extraido: Partial<ComprobanteState>,
  ): ComprobanteState {
    return {
      clienteNombreCompleto:
        extraido.clienteNombreCompleto ?? actual.clienteNombreCompleto,
      clienteContacto: extraido.clienteContacto ?? actual.clienteContacto,
      descripcionTrabajo:
        extraido.descripcionTrabajo ?? actual.descripcionTrabajo,
      duracionEstimada:
        extraido.duracionEstimada ?? actual.duracionEstimada,
      materialEstimado:
        extraido.materialEstimado ?? actual.materialEstimado,
      valorManoObra: extraido.valorManoObra ?? actual.valorManoObra,
      gastosAdicionales:
        extraido.gastosAdicionales ?? actual.gastosAdicionales,
      fechaCreacion: actual.fechaCreacion, // Nunca se sobrescribe
      fechaVencimiento:
        extraido.fechaVencimiento ?? actual.fechaVencimiento,
      estadoFlujo: extraido.estadoFlujo ?? actual.estadoFlujo,
    };
  }
}