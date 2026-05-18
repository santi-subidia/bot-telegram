import axios from "axios";
import type { ComprobanteState } from "../types";

const API_URL = process.env["BACKEND_API_URL"] ?? "http://localhost:5000";

/**
 * Payload para crear un comprobante según la API REST del backend.
 * Usa camelCase como pide la API.
 */
interface ComprobantePayload {
	clienteNombreCompleto: string;
	clienteContacto?: string;
	descripcionTrabajo: string;
	duracionEstimada?: string;
	valorManoObra: number;
	fechaCreacion: string;
	fechaVencimiento?: string;
	materialEstimado: Array<{ producto: string; precio: number }>;
	gastosAdicionales: Array<{ concepto: string; monto: number }>;
}

interface CrearComprobanteResponse {
	id: string;
	pdfUrl: string;
}

/**
 * Transforma el ComprobanteState del bot al payload de la API.
 */
function toApiPayload(state: ComprobanteState): ComprobantePayload {
	return {
		clienteNombreCompleto: state.clienteNombreCompleto ?? "",
		clienteContacto: state.clienteContacto ?? undefined,
		descripcionTrabajo: state.descripcionTrabajo ?? "",
		duracionEstimada: state.duracionEstimada ?? undefined,
		valorManoObra: state.valorManoObra ?? 0,
		fechaCreacion: state.fechaCreacion,
		fechaVencimiento: state.fechaVencimiento ?? undefined,
		materialEstimado: (state.materialEstimado ?? []).map((m) => ({
			producto: m.producto,
			precio: m.precio,
		})),
		gastosAdicionales: (state.gastosAdicionales ?? []).map((g) => ({
			concepto: g.concepto,
			monto: g.monto,
		})),
	};
}

/**
 * Crea un comprobante en el backend y devuelve el ID y la URL del PDF.
 */
export async function crearComprobante(
	state: ComprobanteState,
): Promise<{ id: string; pdfUrl: string }> {
	const payload = toApiPayload(state);

	const response = await axios.post<CrearComprobanteResponse>(
		`${API_URL}/api/comprobantes`,
		payload,
	);

	return {
		id: response.data.id,
		pdfUrl: response.data.pdfUrl,
	};
}

/**
 * Descarga el PDF del comprobante como Buffer.
 */
export async function descargarPdf(comprobanteId: string): Promise<Buffer> {
	const response = await axios.get(
		`${API_URL}/api/comprobantes/${comprobanteId}/pdf`,
		{ responseType: "arraybuffer" },
	);

	return Buffer.from(response.data);
}