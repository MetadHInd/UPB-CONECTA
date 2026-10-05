import type { StudentProfile } from '../domain/entities/StudentProfile.js';
import type { StudentProfileRepositoryPort } from '../domain/ports/out/StudentProfileRepositoryPort.js';

export const MAX_SAVE_ATTEMPTS = 3;

/**
 * Lee, aplica la operacion de dominio y guarda; si otra escritura gano la
 * carrera, vuelve a leer y reaplica sobre el estado nuevo. Devuelve el perfil
 * guardado, `'not-found'` si `apply` no tiene perfil sobre el cual operar, o
 * `'conflict'` si tras varios intentos sigue perdiendo.
 */
export async function saveWithRetry(
  profiles: StudentProfileRepositoryPort,
  email: string,
  apply: (current: StudentProfile | null) => StudentProfile | null
): Promise<StudentProfile | 'not-found' | 'conflict'> {
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
    const next = apply(await profiles.findByEmail(email));
    if (next === null) return 'not-found';
    if (await profiles.save(next)) return next;
  }
  return 'conflict';
}
