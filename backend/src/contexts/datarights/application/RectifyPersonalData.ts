import type { DirectoryCorrectionChannel, RetentionPolicy } from '../domain/entities/RetentionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ProfileRectificationPort } from '../domain/ports/out/ProfileRectificationPort.js';
import type { RectificationLogPort } from '../domain/ports/out/RectificationLogPort.js';
import { normalizeSubject } from './normalizeSubject.js';

export enum RectificationFailureKind {
  /** Criterio 3: el dato lo provee el directorio institucional. */
  DIRECTORY_PROVIDED = 'directory-provided',
  REJECTED = 'rejected'
}

export type RectifyPersonalDataResult =
  | {
      readonly ok: true;
      readonly rectifiedAt: Date;
      readonly changes: readonly { readonly field: string; readonly previousValue: string | number | null; readonly newValue: string | number | null }[];
    }
  | {
      readonly ok: false;
      readonly error: RectificationFailureKind.DIRECTORY_PROVIDED;
      readonly message: string;
      readonly fields: readonly string[];
      /** Donde debe tramitar el estudiante la correccion. */
      readonly channel: DirectoryCorrectionChannel;
    }
  | {
      readonly ok: false;
      readonly error: RectificationFailureKind.REJECTED;
      readonly message: string;
      readonly fields?: readonly string[];
    };

/**
 * Rectificacion por el titular (HU-48 criterios 2 y 3). Delega la decision de
 * que es editable a `profile` (una sola fuente de la frontera solo lectura /
 * editable, HU-37) y agrega dos cosas propias del derecho: el registro con
 * fecha de cada correccion aplicada y, cuando el dato viene del directorio, el
 * canal institucional al que se remite al estudiante.
 */
export class RectifyPersonalData {
  constructor(
    private readonly dependencies: {
      readonly profile: ProfileRectificationPort;
      readonly log: RectificationLogPort;
      readonly policy: RetentionPolicy;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: {
    readonly subject: string;
    /** Cuerpo sin tipo de la peticion: la validacion es del servidor. */
    readonly changes: Readonly<Record<string, unknown>>;
  }): Promise<RectifyPersonalDataResult> {
    const { profile, log, policy, clock } = this.dependencies;
    const subject = normalizeSubject(input.subject);
    const outcome = await profile.rectify(subject, input.changes);

    if (outcome.kind === 'directory-provided') {
      return {
        ok: false,
        error: RectificationFailureKind.DIRECTORY_PROVIDED,
        message: policy.directoryCorrectionChannel.instructions,
        fields: outcome.fields,
        channel: policy.directoryCorrectionChannel
      };
    }
    if (outcome.kind === 'rejected') {
      return {
        ok: false,
        error: RectificationFailureKind.REJECTED,
        message: outcome.message,
        ...(outcome.fields === undefined ? {} : { fields: outcome.fields })
      };
    }

    const rectifiedAt = clock.now();
    for (const change of outcome.changes) {
      await log.record({ subject, field: change.field, previousValue: change.previousValue, newValue: change.newValue, rectifiedAt });
    }
    return { ok: true, rectifiedAt, changes: outcome.changes };
  }
}
