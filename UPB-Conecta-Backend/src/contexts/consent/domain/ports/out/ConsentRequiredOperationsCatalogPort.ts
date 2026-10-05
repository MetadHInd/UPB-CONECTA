import type { ConsentDocumentType } from '../../entities/ConsentRecord.js';

/**
 * HU-44, criterio 3: que documentos de consentimiento exige cada operacion
 * que trata datos personales. Mismo patron declarativo que
 * `ProtectedOperationsCatalogPort` (HU-46, `config/protected-operations.json`)
 * — un archivo de configuracion, no una constante en codigo, para que agregar
 * una operacion sea editar el catalogo y no recompilar.
 *
 * No se retroactivo sobre todos los casos de uso existentes que tocan datos
 * del estudiante: esta historia entrega el mecanismo (el gate y su catalogo),
 * no la migracion completa — mismo alcance que declaro HU-46 para su propio
 * catalogo. `ViewStudentProfile`/`UpdateStudentProfile` (perfil, HU-04) y
 * `CreatePost` (foro, HU-30) quedan registrados como ejemplo representativo;
 * agregar el resto es una linea nueva por operacion.
 */
export interface ConsentRequiredOperationEntry {
  /** Nombre de la clase de caso de uso, igual que `ProtectedOperationEntry.operation`. */
  readonly operation: string;
  readonly documentTypes: readonly ConsentDocumentType[];
}

export interface ConsentRequiredOperationsCatalog {
  readonly operations: readonly ConsentRequiredOperationEntry[];
}

/** `null` si la operacion no esta catalogada (no exige consentimiento, o el catalogo esta desactualizado). */
export function requiredConsentDocumentsFor(
  catalog: ConsentRequiredOperationsCatalog,
  operation: string
): readonly ConsentDocumentType[] | null {
  return catalog.operations.find((entry) => entry.operation === operation)?.documentTypes ?? null;
}
