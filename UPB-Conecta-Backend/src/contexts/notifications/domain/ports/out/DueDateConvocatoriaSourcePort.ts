/**
 * HU-19: lo minimo que `EmitDueDateReminders` necesita de una convocatoria
 * para decidir si corresponde avisar. Tipo propio de `notifications`, no el
 * `ConsolidatedMessageRecord` de `ingestion` — mismo desacople que
 * `PendingNotification` ya aplica en HU-21 (dominio propio, sin filtrar
 * tipos ajenos).
 *
 * `dueAt: null` cubre tanto "sin vencimiento" como "fecha ambigua": ninguno
 * de los dos tiene un instante concreto del que restar una anticipacion, asi
 * que ninguno programa avisos (no es un caso de HU-19, RF-27 solo habla de
 * "convocatoria con fecha de cierre publicada").
 */
export interface DueDateConvocatoriaCandidate {
  readonly convocatoriaId: string;
  readonly representativeMessageId: string | null;
  readonly dueAt: Date | null;
  readonly withdrawn: boolean;
}

/**
 * Decision de diseno: no se reutiliza `ConsolidatedMessageRegistryPort` de
 * `ingestion` (le falta un metodo de enumeracion, y este contexto no debe
 * modificar `ingestion`). Se define aqui un puerto propio, con su propio
 * adaptador Mongo que lee la misma coleccion (`ingestion_consolidated_messages`)
 * de forma independiente — mismo patron que ya usa `feed` con
 * `ConvocatoriaRepositoryPort`/`MongoConvocatoriaRepository` para el mismo
 * problema (leer la convocatoria consolidada sin pasar por el puerto de
 * `ingestion`, que tampoco expone enumeracion).
 */
export interface DueDateConvocatoriaSourcePort {
  findWithDueDate(): Promise<readonly DueDateConvocatoriaCandidate[]>;
}
