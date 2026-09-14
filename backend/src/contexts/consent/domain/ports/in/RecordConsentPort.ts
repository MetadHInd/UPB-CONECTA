import type { ConsentDocumentType, ConsentRecord } from '../../entities/ConsentRecord.js';

export interface RecordConsentCommand {
  readonly studentId: string;
  readonly documentType: ConsentDocumentType;
  readonly version: string;
}

export interface RecordConsentPort {
  execute(command: RecordConsentCommand): Promise<ConsentRecord>;
}
