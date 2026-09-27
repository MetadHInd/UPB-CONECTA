/**
 * HU-39, criterio 2: el cierre de sesion invalida el dispositivo de esa
 * cuenta. `identity` solo conoce este puerto; lo implementa un adaptador que
 * traduce al registro de dispositivos de `notifications` (HU-18).
 */
export interface DeviceInvalidationPort {
  /**
   * Invalida `deviceToken` solo si esta registrado a nombre de `studentId`:
   * un estudiante no puede silenciar el dispositivo de otro. Idempotente y
   * silenciosa si el dispositivo no existe o pertenece a otra cuenta.
   */
  invalidateForStudent(studentId: string, deviceToken: string): Promise<void>;
}
