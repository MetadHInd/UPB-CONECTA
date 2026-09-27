import type { ModerationAnalysis, ModerationPort, ModerationRequest } from '../../src/contexts/moderation/domain/ports/out/ModerationPort.js';

export type ModerationScript = { readonly score: number } | 'fail' | 'hang' | { readonly delayMs: number; readonly score: number } | { readonly raw: unknown };

/**
 * Doble de `ModerationPort` para pruebas: devuelve el puntaje que se le
 * indique, falla, o no responde nunca. Guarda cada solicitud recibida para
 * verificar que no lleva datos del estudiante (HU-31 criterio 7).
 */
export class ScriptedModerationPort implements ModerationPort {
  readonly requests: ModerationRequest[] = [];

  constructor(public script: ModerationScript = { score: 0.05 }) {}

  async analyze(request: ModerationRequest): Promise<ModerationAnalysis> {
    this.requests.push(request);
    const script = this.script;
    if (script === 'fail') throw new Error('servicio de moderación no disponible');
    if (script === 'hang') return new Promise<ModerationAnalysis>(() => undefined);
    if ('raw' in script) return script.raw as ModerationAnalysis;
    if ('delayMs' in script) {
      await new Promise((resolve) => setTimeout(resolve, script.delayMs));
    }
    return { score: script.score };
  }
}
