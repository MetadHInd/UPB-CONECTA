import type { ConvocatoriaPersonalState } from '../../entities/ConvocatoriaPersonalState.js';

export interface UpdatePersonalStateCommand {
  readonly studentId: string;
  readonly convocatoriaId: string;
  /** Solo las banderas que cambian; el resto conserva su valor actual. */
  readonly read?: boolean;
  readonly saved?: boolean;
  readonly archived?: boolean;
}

export interface UpdatePersonalStatePort {
  execute(command: UpdatePersonalStateCommand): Promise<ConvocatoriaPersonalState>;
}
