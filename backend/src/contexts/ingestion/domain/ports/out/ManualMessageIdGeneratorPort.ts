/**
 * HU-50: una convocatoria publicada manualmente no llego por correo, asi que
 * no tiene un `Message-ID` real de donde derivar su identidad de
 * clasificacion/targeting (`representativeMessageId`). Este puerto genera
 * uno sintetico pero con la misma forma que exige `MessageId.fromHeader`
 * (incluye `@`), para no crear un segundo esquema de identidad paralelo.
 */
export interface ManualMessageIdGeneratorPort {
  newMessageId(): string;
}
