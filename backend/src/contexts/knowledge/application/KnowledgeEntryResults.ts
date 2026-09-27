import type { KnowledgeEntryIssue } from '../domain/services/KnowledgeEntryValidation.js';

export enum KnowledgeFailureKind {
  INVALID_ENTRY = 'invalid-entry',
  ENTRY_NOT_FOUND = 'entry-not-found',
  ENTRY_WITHDRAWN = 'entry-withdrawn'
}

export type KnowledgeFailure = {
  readonly ok: false;
  readonly error: KnowledgeFailureKind;
  readonly message: string;
  /** Solo en `invalid-entry`: que falta o esta mal, campo por campo (HU-41 criterio 5). */
  readonly issues?: readonly KnowledgeEntryIssue[];
};

export function invalidEntry(issues: readonly KnowledgeEntryIssue[]): KnowledgeFailure {
  return {
    ok: false,
    error: KnowledgeFailureKind.INVALID_ENTRY,
    message: `No se guardó la entrada. ${issues.map((issue) => issue.message).join(' ')}`,
    issues
  };
}

export function entryNotFound(id: string): KnowledgeFailure {
  return { ok: false, error: KnowledgeFailureKind.ENTRY_NOT_FOUND, message: `No existe la entrada "${id}" de la base de conocimiento.` };
}

export function entryWithdrawn(): KnowledgeFailure {
  return { ok: false, error: KnowledgeFailureKind.ENTRY_WITHDRAWN, message: 'La entrada ya fue retirada.' };
}
