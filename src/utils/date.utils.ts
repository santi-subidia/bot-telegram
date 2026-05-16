/**
 * Genera la fecha de creación en formato ISO 8601.
 * Se inyecta automáticamente al iniciar una sesión.
 */
export function generarFechaCreacion(): string {
  return new Date().toISOString();
}

/**
 * Parsea una fecha de vencimiento expresada en lenguaje natural.
 * Ejemplos soportados:
 *   "15 días" -> fecha actual + 15 días
 *   "30 días" -> fecha actual + 30 días
 *   "una semana" -> fecha actual + 7 días
 *   "2 semanas" -> fecha actual + 14 días
 *   "2026-06-15" -> fecha literal (ya en ISO)
 *
 * Si la entrada ya es una fecha ISO válida, la devuelve tal cual.
 * Si no puede parsear, devuelve null.
 */
export function parsearFechaVencimiento(input: string | null | undefined): string | null {
  if (!input) return null;

  // Caso 1: ya es una fecha ISO válida
  const asDate = new Date(input);
  if (!isNaN(asDate.getTime()) && input.includes("-")) {
    return asDate.toISOString();
  }

  const ahora = new Date();
  const inputNorm = input.toLowerCase().trim();

  // Caso 2: "N días" o "N dia" / "N dia(s)"
  const diasMatch = inputNorm.match(/^(\d+)\s*d[ií]as?$/);
  if (diasMatch) {
    const dias = Number(diasMatch[1]);
    return new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
  }

  // Caso 3: "una semana" / "N semanas"
  const semanasMatch = inputNorm.match(/^(\d+)?\s*semanas?$/);
  if (semanasMatch) {
    const semanas = semanasMatch[1] ? Number(semanasMatch[1]) : 1;
    return new Date(ahora.getTime() + semanas * 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Caso 4: "un mes" / "N meses"
  const mesesMatch = inputNorm.match(/^(\d+)?\s*mes(es)?$/);
  if (mesesMatch) {
    const meses = mesesMatch[1] ? Number(mesesMatch[1]) : 1;
    const resultado = new Date(ahora);
    resultado.setMonth(resultado.getMonth() + meses);
    return resultado.toISOString();
  }

  return null;
}

/**
 * Formatea una fecha ISO en formato legible para el resumen.
 * Ej: "15/05/2026"
 */
export function formatoLegible(isoDate: string): string {
  const fecha = new Date(isoDate);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = fecha.getFullYear();
  return `${dia}/${mes}/${anio}`;
}