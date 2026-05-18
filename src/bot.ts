import "dotenv/config";
import {
	Bot,
	type Context,
	GrammyError,
	HttpError,
	InputFile,
	session,
	type SessionFlavor,
} from "grammy";
import type { SessionData, LLMProviderName } from "./types";
import { AIService, createLLMProvider, crearComprobante, descargarPdf } from "./services";
import { generarResumen } from "./services/validation.service";
import { generarFechaCreacion } from "./utils";

// ============================================
// Tipado del contexto con sesión
// ============================================

type MyContext = Context & SessionFlavor<SessionData>;

// ============================================
// Configuración
// ============================================

const BOT_TOKEN = process.env["BOT_TOKEN"];
const LLM_PROVIDER = (process.env["LLM_PROVIDER"] ??
	"gemini") as LLMProviderName;

if (!BOT_TOKEN) {
	throw new Error("BOT_TOKEN es requerido. Configuralo en el archivo .env");
}

// ============================================
// Sesión por defecto
// ============================================

function crearSesionInicial(): SessionData {
	return {
		historialChat: [],
		comprobanteActual: {
			clienteNombreCompleto: null,
			clienteContacto: null,
			descripcionTrabajo: null,
			duracionEstimada: null,
			materialEstimado: null,
			valorManoObra: null,
			gastosAdicionales: null,
			fechaCreacion: generarFechaCreacion(),
			fechaVencimiento: null,
			estadoFlujo: "RECOPILANDO_DATOS",
		},
	};
}

// ============================================
// Inicializar bot y servicios
// ============================================

const bot = new Bot<MyContext>(BOT_TOKEN);

const llmProvider = createLLMProvider(LLM_PROVIDER, {
	GEMINI_API_KEY: process.env["GEMINI_API_KEY"] ?? "",
	GEMINI_MODEL: process.env["GEMINI_MODEL"] ?? "",
	OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "",
	OPENAI_MODEL: process.env["OPENAI_MODEL"] ?? "",
	NVIDIA_API_KEY: process.env["NVIDIA_API_KEY"] ?? "",
	NVIDIA_MODEL: process.env["NVIDIA_MODEL"] ?? "",
});

const aiService = new AIService(llmProvider);

console.log(`[Bot] Provider de LLM: ${llmProvider.name}`);

// ============================================
// Middleware de sesión
// ============================================

bot.use(
	session({
		initial: crearSesionInicial,
	}),
);

// ============================================
// Comando /start — Bienvenida
// ============================================

bot.command("start", async (ctx) => {
	ctx.session = crearSesionInicial();

	await ctx.reply(
		"¡Hola! 👋 Soy tu asistente para armar presupuestos.\n\n" +
			"Contame qué trabajo tenés que presupuestar y voy guiándote paso a paso.\n" +
			'Podés empezar con algo como: "Tengo que armar un presupuesto para un cliente, cambio de cables eléctricos"',
	);
});

// ============================================
// Comando /reset — Reiniciar sesión
// ============================================

bot.command("reset", async (ctx) => {
	ctx.session = crearSesionInicial();
	await ctx.reply(
		"Sesión reiniciada 🔄 Contame de nuevo qué presupuesto necesitás armar.",
	);
});

// ============================================
// Comando /resumen — Ver estado actual
// ============================================

bot.command("resumen", async (ctx) => {
	const comprobante = ctx.session.comprobanteActual;

	if (comprobante.estadoFlujo === "RECOPILANDO_DATOS") {
		await ctx.reply(
			`Estado actual del presupuesto:\n\n${generarResumen(comprobante)}\n\n` +
				"Todavía faltan datos para completarlo. Seguí contándome lo que te falta.",
		);
	} else {
		await ctx.reply(generarResumen(comprobante));
	}
});

// ============================================
// Constantes de confirmación
// ============================================

const PATRONES_CONFIRMACION = /^(sí|si|confirmar|confirmo|está bien|dale|va|ok|yes)$/i;

// ============================================
// Manejo de mensajes de texto — Flujo principal
// ============================================

bot.on("message:text", async (ctx) => {
	const userMessage = ctx.message.text;
	const sessionData: SessionData = ctx.session;

	// Si el comprobante ya está CONFIRMADO, no procesar más
	if (sessionData.comprobanteActual.estadoFlujo === "CONFIRMADO") {
		await ctx.reply(
			"✅ Este presupuesto ya fue confirmado. Usá /reset para empezar uno nuevo.",
		);
		return;
	}

	// Si está LISTO_PARA_CONFIRMAR y el usuario confirma, crear comprobante
	if (sessionData.comprobanteActual.estadoFlujo === "LISTO_PARA_CONFIRMAR") {
		if (PATRONES_CONFIRMACION.test(userMessage.trim())) {
			await ctx.replyWithChatAction("typing");
			try {
				const comprobante = sessionData.comprobanteActual;
				const { id, pdfUrl } = await crearComprobante(comprobante);
				const pdfBuffer = await descargarPdf(id);

				await ctx.reply("✅ Presupuesto confirmado. Generando PDF...");

				await ctx.replyWithDocument(
					new InputFile(pdfBuffer, `comprobante-${id.slice(0, 8)}.pdf`),
				);

				// Marcar como confirmado
				ctx.session.comprobanteActual.estadoFlujo = "CONFIRMADO";
				return;
			} catch (error) {
				console.error("[Bot] Error al crear comprobante:", error);
				await ctx.reply(
					"❌ Hubo un error al guardar el presupuesto. Intentá de nuevo.",
				);
				return;
			}
		}
	}

	// Mostrar indicador de "escribiendo..." mientras se procesa
	await ctx.replyWithChatAction("typing");

	try {
		const { reply, updatedSession } = await aiService.handleMessage(
			userMessage,
			sessionData,
		);

		// Actualizar sesión
		ctx.session = updatedSession;

		// Enviar respuesta
		await ctx.reply(reply, { parse_mode: "Markdown" });
	} catch (error) {
		console.error("[Bot] Error procesando mensaje:", error);
		await ctx.reply(
			"Perdón, hubo un error al procesar tu mensaje. Intentá de nuevo.",
		);
	}
});

// ============================================
// Manejo de errores global
// ============================================

bot.catch((err) => {
	const e = err.error;
	if (e instanceof GrammyError) {
		console.error("[Bot] Error de la API de Telegram:", e.description);
	} else if (e instanceof HttpError) {
		console.error("[Bot] Error de red:", e);
	} else {
		console.error("[Bot] Error inesperado:", e);
	}
});

// ============================================
// Graceful shutdown
// ============================================

let cerrando = false;

async function shutdown() {
	if (cerrando) return;
	cerrando = true;
	console.log("\n[Bot] Cerrando...");
	await bot.stop();
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ============================================
// Iniciar bot con retry
// ============================================

async function main() {
	console.log("[Bot] Iniciando bot de Telegram...");

	let intentos = 0;
	const maxIntentos = 10;
	const delayBase = 1000;

	while (intentos < maxIntentos) {
		if (cerrando) return; // Ya se está cerrando
		intentos++;
		try {
			console.log(`[Bot] Intentando conectar (${intentos}/${maxIntentos})...`);
			const startTime = Date.now();
			await bot.start({
				onStart: (info) => {
					const elapsed = Date.now() - startTime;
					console.log(`[Bot] Conectado como @${info.username} (${elapsed}ms)`);
				},
			});
			return; // Conexión exitosa, salir del loop
		} catch (error) {
			if (cerrando) return; // Ctrl+C mientras se conectaba
			const err = error instanceof Error ? error : String(error);
			console.error(`[Bot] Error: ${err}`);
			// Mostrar stack trace si no es un error conocido
			if (error instanceof Error && error.stack) {
				console.error(error.stack.split("\n").slice(1, 4).join("\n"));
			}
			if (intentos < maxIntentos) {
				const delay = delayBase * Math.pow(2, intentos - 1);
				console.log(`[Bot] Reintentando en ${delay / 1000}s... (Ctrl+C para salir)`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	if (!cerrando) {
		console.error("[Bot] No se pudo conectar. Saliendo.");
		process.exit(1);
	}
}

main();
