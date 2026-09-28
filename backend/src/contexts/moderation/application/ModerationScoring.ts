import type { ModerationPort, ModerationRequest } from '../domain/ports/out/ModerationPort.js';

/**
 * Pide el puntaje al modelo con un plazo máximo. Un fallo, una respuesta sin
 * puntaje numérico o el plazo vencido se traducen en `null`, que la política
 * resuelve reteniendo (HU-31 criterio 6). Nunca lanza.
 */
export async function scoreWithin(moderation: ModerationPort, request: ModerationRequest, timeoutMs: number): Promise<number | null> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const analysis = moderation.analyze(request).then(
    (result) => (typeof result?.score === 'number' ? result.score : null),
    () => null
  );
  try {
    return await Promise.race([analysis, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
