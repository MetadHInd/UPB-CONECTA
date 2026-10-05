/**
 * HU-47, criterio 4: "el mensaje de error no revela detalles internos de la
 * implementacion". Un adaptador de entrada futuro debe poder tomar
 * `.message` de este error y devolverlo tal cual al cliente, sin filtrar
 * nunca un stack trace, un nombre de clase interno o el mensaje crudo de un
 * driver (por ejemplo, de MongoDB). `CreatePost` (HU-30) ya sigue esta
 * misma disciplina de forma independiente (`PostRejectionKind` + mensajes
 * redactados a mano); esta clase formaliza el contrato para el resto del
 * backend.
 */
export class PublicSafeValidationError extends Error {
  constructor(
    message: string,
    readonly field: string
  ) {
    super(message);
    this.name = 'PublicSafeValidationError';
  }
}
