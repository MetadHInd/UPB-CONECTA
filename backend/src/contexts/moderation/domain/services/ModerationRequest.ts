import { maskPersonalData, type MaskedPersonIdentity } from '../../../hardening/domain/services/PersonalDataMasking.js';
import type { ModerationRequest } from '../ports/out/ModerationPort.js';

export type ModerationAuthorIdentity = MaskedPersonIdentity;

/**
 * Arma lo que se envía al servicio externo (HU-31 criterio 7): título y
 * cuerpo, sin datos identificatorios. El autor nunca viaja como campo; además
 * se enmascaran, dentro del propio texto, correos, números largos, el
 * identificador estudiantil y las palabras del nombre y del usuario del
 * autor (`maskPersonalData`), porque los estudiantes a veces se firman en el texto.
 */
export function buildModerationRequest(input: {
  readonly title: string;
  readonly text: string;
  readonly author: ModerationAuthorIdentity;
}): ModerationRequest {
  return { text: maskPersonalData(`${input.title}\n${input.text}`, input.author) };
}
