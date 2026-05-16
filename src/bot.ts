import "dotenv/config";
import { Bot, Context, GrammyError, HttpError, session, SessionFlavor } from "grammy";
import type { SessionData, LLMProviderName } from "./types";
import { AIService, createLLMProvider } from "./services";
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
const LLM_PROVIDER = (process.env["LLM_PROVIDER"] ?? "gemini") as LLMProviderName;

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
    "Podés empezar con algo como: \"Tengo que armar un presupuesto para un cliente, cambio de cables eléctricos\"",
  );
});

// ============================================
// Comando /reset — Reiniciar sesión
// ============================================

bot.command("reset", async (ctx) => {
  ctx.session = crearSesionInicial();
  await ctx.reply("Sesión reiniciada 🔄 Contame de nuevo qué presupuesto necesitás armar.");
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
// Iniciar bot
// ============================================

async function main() {
  console.log("[Bot] Iniciando bot de Telegram...");
  await bot.start({
    onStart: (info) => {
      console.log(`[Bot] Conectado como @${info.username}`);
    },
  });
}

main();