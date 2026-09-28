/**
 * HU-23, criterio 3: estudiantes que pidieron que se les recuerde el cierre
 * de una convocatoria por seguirla ellos mismos (una oferta de practica
 * marcada de interes o de postulacion), aparte del publico que le da su
 * segmentacion por programa.
 *
 * Tipo propio de `notifications`, como `StudentDirectoryPort`: el adaptador
 * traduce desde `practices`, y este contexto no sabe que es un seguimiento.
 */
export interface ConvocatoriaFollowersPort {
  /** Por `representativeMessageId`, los `studentId` que la siguen. Sin seguidores, no aparece. */
  findFollowers(representativeMessageIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>;
}
