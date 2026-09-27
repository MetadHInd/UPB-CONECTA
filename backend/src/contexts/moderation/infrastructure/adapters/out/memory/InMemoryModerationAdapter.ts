import type { ModerationAnalysis, ModerationPort, ModerationRequest } from '../../../../domain/ports/out/ModerationPort.js';
import { normalizeForMatching } from '../../../../domain/services/TextNormalization.js';

/**
 * Stub determinístico del modelo de detección de lenguaje ofensivo en
 * español (HU-31 criterio 1). No hay proveedor de IA real en este
 * repositorio; mismo criterio que `InMemoryClassificationAdapter` (HU-10):
 * el puntaje es reproducible y NO es una medida real de toxicidad. Un
 * proveedor real reemplazará este adaptador sin tocar dominio ni aplicación.
 *
 * Puntaje: 0.05 sin coincidencias; 0.6 con una palabra ofensiva leve (queda
 * retenido); 0.9 con una fuerte o con varias leves (queda bloqueado).
 */
const MILD = ['tonto', 'tonta', 'estupido', 'estupida', 'imbecil', 'idiota', 'inutil', 'basura', 'asco'];
const STRONG = ['hijueputa', 'malparido', 'gonorrea', 'mierda'];

export class InMemoryModerationAdapter implements ModerationPort {
  async analyze(request: ModerationRequest): Promise<ModerationAnalysis> {
    const words = normalizeForMatching(request.text).split(/[^\p{L}\p{N}]+/u);
    const strong = words.filter((word) => STRONG.includes(word)).length;
    const mild = words.filter((word) => MILD.includes(word)).length;
    if (strong > 0 || mild > 1) return { score: 0.9 };
    if (mild === 1) return { score: 0.6 };
    return { score: 0.05 };
  }
}
