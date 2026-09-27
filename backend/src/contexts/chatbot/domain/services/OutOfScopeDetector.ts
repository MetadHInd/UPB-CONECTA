import type { OutOfScopePolicyConfig, OutOfScopeTopic } from '../value-objects/ChatbotConfig.js';

/** Minusculas, sin tildes ni signos, espacios colapsados. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * HU-42 criterio 5: detecta preguntas sobre datos que viven en la aplicacion
 * institucional (notas, estado academico). Corre ANTES del modelo: la
 * exclusion es una regla de dominio, no una instruccion al proveedor.
 */
export function detectOutOfScopeTopic(question: string, policy: OutOfScopePolicyConfig): OutOfScopeTopic | null {
  const normalized = ` ${normalizeText(question)} `;
  for (const topic of policy.topics) {
    if (topic.keywords.some((keyword) => normalized.includes(` ${normalizeText(keyword)} `))) return topic;
  }
  return null;
}
