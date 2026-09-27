/**
 * Areas de datos personales que el sistema conserva de un estudiante
 * (HU-48 criterio 1: perfil, preferencias y publicaciones; el diseno suma el
 * seguimiento de convocatorias y el registro de dispositivo, que la supresion
 * tambien debe alcanzar).
 */
export type PersonalDataArea = 'profile' | 'preferences' | 'publications' | 'applicationTracking' | 'devices';

export const PERSONAL_DATA_AREAS: readonly PersonalDataArea[] = [
  'profile',
  'preferences',
  'publications',
  'applicationTracking',
  'devices'
];

/** Un registro conservado, en terminos que el titular entiende (nunca la fila interna). */
export type PersonalDataValue = string | number | boolean | Date | null;
export type PersonalDataRecord = Readonly<Record<string, PersonalDataValue>>;

export interface PersonalDataAreaReport {
  readonly area: PersonalDataArea;
  readonly records: readonly PersonalDataRecord[];
}
