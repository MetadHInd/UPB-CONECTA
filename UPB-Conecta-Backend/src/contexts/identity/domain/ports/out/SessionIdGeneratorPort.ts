/**
 * Genera identificadores impredecibles para cadenas (`chainId`) y tokens
 * (`jti`). La aleatoriedad criptografica vive en infraestructura.
 */
export interface SessionIdGeneratorPort {
  newId(): string;
}
