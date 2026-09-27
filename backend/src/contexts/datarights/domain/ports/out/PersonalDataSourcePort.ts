import type { PersonalDataArea, PersonalDataRecord } from '../../entities/PersonalDataArea.js';

/**
 * Un area de datos del titular. Cada contexto que guarda datos personales
 * aporta un adaptador de integracion; el dominio de este
 * contexto solo coordina. Agregar un area nueva es agregar un adaptador, y una
 * prueba exige que cada valor de `PERSONAL_DATA_AREAS` tenga uno cableado.
 */
export interface PersonalDataSourcePort {
  readonly area: PersonalDataArea;
  /** Lo que se conserva del titular. `subject` = correo institucional normalizado. */
  collect(subject: string): Promise<readonly PersonalDataRecord[]>;
  /** Borra lo que conserva; devuelve cuantos registros elimino. Idempotente. */
  erase(subject: string): Promise<number>;
}
