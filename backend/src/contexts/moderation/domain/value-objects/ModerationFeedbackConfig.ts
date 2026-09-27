/**
 * HU-32: configuracion como dato de la retroalimentacion al autor. El plazo
 * de resolucion humana (criterio 5) y el catalogo de normas de convivencia
 * (criterio 2) viven en `config/moderation-feedback.json`, no en el codigo:
 * cambiar el plazo o el texto de una norma no exige redespliegue.
 */
export interface CommunityNorm {
  /** Categoria de infraccion que sustenta la norma (la que trae la decision de moderacion). */
  readonly category: string;
  /** Codigo estable de la norma, citable ante el estudiante ("NC-01"). */
  readonly code: string;
  readonly title: string;
  readonly text: string;
}

export interface ModerationFeedbackConfig {
  readonly resolutionDeadlineHours: number;
  readonly norms: readonly CommunityNorm[];
}

export class InvalidModerationFeedbackConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de retroalimentacion de moderacion invalida: ${motivo}`);
    this.name = 'InvalidModerationFeedbackConfigError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(source: Record<string, unknown>, field: string, where: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidModerationFeedbackConfigError(`${where}.${field} debe ser un texto no vacio`);
  }
  return value.trim();
}

/** Valida un JSON sin tipar y devuelve la configuracion; rechaza plazos no enteros o normas duplicadas. */
export function parseModerationFeedbackConfig(raw: unknown): ModerationFeedbackConfig {
  if (!isRecord(raw)) throw new InvalidModerationFeedbackConfigError('debe ser un objeto');

  const hours = raw['resolutionDeadlineHours'];
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours <= 0) {
    throw new InvalidModerationFeedbackConfigError('resolutionDeadlineHours debe ser un entero positivo');
  }

  const rawNorms = raw['norms'];
  if (!Array.isArray(rawNorms) || rawNorms.length === 0) {
    throw new InvalidModerationFeedbackConfigError('norms debe ser una lista con al menos una norma');
  }

  const categories = new Set<string>();
  const codes = new Set<string>();
  const norms = rawNorms.map((entry: unknown, index): CommunityNorm => {
    const where = `norms[${index}]`;
    if (!isRecord(entry)) throw new InvalidModerationFeedbackConfigError(`${where} debe ser un objeto`);
    const norm: CommunityNorm = {
      category: requireText(entry, 'category', where),
      code: requireText(entry, 'code', where),
      title: requireText(entry, 'title', where),
      text: requireText(entry, 'text', where)
    };
    if (categories.has(norm.category)) throw new InvalidModerationFeedbackConfigError(`la categoria "${norm.category}" esta repetida`);
    if (codes.has(norm.code)) throw new InvalidModerationFeedbackConfigError(`el codigo "${norm.code}" esta repetido`);
    categories.add(norm.category);
    codes.add(norm.code);
    return norm;
  });

  return { resolutionDeadlineHours: hours, norms };
}

export function findNormForCategory(config: ModerationFeedbackConfig, category: string): CommunityNorm | null {
  return config.norms.find((norm) => norm.category === category) ?? null;
}
