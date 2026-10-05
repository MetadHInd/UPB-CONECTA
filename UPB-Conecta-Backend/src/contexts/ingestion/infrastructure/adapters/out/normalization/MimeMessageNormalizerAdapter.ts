import type { MessageNormalizerPort } from '../../../../domain/ports/out/MessageNormalizerPort.js';
import type { RawInstitutionalMessage } from '../../../../domain/entities/RawInstitutionalMessage.js';
import type { InstitutionalMessage } from '../../../../domain/entities/InstitutionalMessage.js';
import { normalizeInstitutionalMessage } from '../../../normalization/MimeMessageNormalizer.js';

export class MimeMessageNormalizerAdapter implements MessageNormalizerPort {
  normalize(raw: RawInstitutionalMessage): InstitutionalMessage {
    return normalizeInstitutionalMessage(raw);
  }
}
