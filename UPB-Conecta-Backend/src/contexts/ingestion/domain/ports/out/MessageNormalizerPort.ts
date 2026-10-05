import type { RawInstitutionalMessage } from '../../entities/RawInstitutionalMessage.js';
import type { InstitutionalMessage } from '../../entities/InstitutionalMessage.js';

/**
 * Puerto de salida hacia la normalizacion MIME de HU-02: la aplicacion no
 * conoce el parseo de multiparte/HTML/quoted-printable, solo pide un
 * `InstitutionalMessage` a partir de un `RawInstitutionalMessage`.
 */
export interface MessageNormalizerPort {
  normalize(raw: RawInstitutionalMessage): InstitutionalMessage;
}
