import type { PersonalDataAreaReport } from '../domain/entities/PersonalDataArea.js';
import type { RectificationEntry } from '../domain/entities/RectificationEntry.js';
import type { RetainedRecordNotice, RetentionPolicy } from '../domain/entities/RetentionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PersonalDataSourcePort } from '../domain/ports/out/PersonalDataSourcePort.js';
import type { RectificationLogPort } from '../domain/ports/out/RectificationLogPort.js';
import { normalizeSubject } from './normalizeSubject.js';

export interface PersonalDataReport {
  readonly subject: string;
  readonly generatedAt: Date;
  /** Una entrada por area, en el orden de las fuentes cableadas; las areas sin datos traen `records: []`. */
  readonly areas: readonly PersonalDataAreaReport[];
  /** Correcciones que el titular hizo, con fecha (criterio 2). */
  readonly rectifications: readonly RectificationEntry[];
  /** Lo que se conserva aunque pida la supresion, y por que. */
  readonly retained: readonly RetainedRecordNotice[];
}

/**
 * Consulta del titular (HU-48 criterio 1): que datos de perfil, preferencias y
 * publicaciones conserva el sistema sobre el. El sujeto sale de la sesion
 * verificada (HU-45), nunca de un valor enviado por el cliente: un estudiante
 * solo puede consultar lo suyo.
 */
export class GetPersonalDataReport {
  constructor(
    private readonly dependencies: {
      readonly sources: readonly PersonalDataSourcePort[];
      readonly rectifications: RectificationLogPort;
      readonly policy: RetentionPolicy;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly subject: string }): Promise<PersonalDataReport> {
    const { sources, rectifications, policy, clock } = this.dependencies;
    const subject = normalizeSubject(input.subject);
    const areas = await Promise.all(
      sources.map(async (source) => ({ area: source.area, records: await source.collect(subject) }))
    );
    return {
      subject,
      generatedAt: clock.now(),
      areas,
      rectifications: await rectifications.findBySubject(subject),
      retained: policy.retainedRecords
    };
  }
}
