export interface RegisterDeviceCommand {
  readonly studentId: string;
  readonly deviceToken: string;
  /** Presente cuando el proveedor roto el identificador (criterio 2). */
  readonly previousToken?: string;
}

export interface RegisterDevicePort {
  execute(command: RegisterDeviceCommand): Promise<void>;
}
