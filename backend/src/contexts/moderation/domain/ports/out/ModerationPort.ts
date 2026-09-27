/**
 * Lo único que sale hacia el servicio externo de moderación (HU-31
 * criterio 7): el texto, ya sin datos identificatorios. El tipo no tiene
 * campos de autor a propósito.
 */
export interface ModerationRequest {
  readonly text: string;
}

export interface ModerationAnalysis {
  /** Severidad de lenguaje ofensivo: 0 limpio, 1 ofensivo. */
  readonly score: number;
}

/**
 * Puerto de salida hacia el modelo de detección de lenguaje ofensivo
 * adaptado al español (HU-31 criterio 1). Si falla, lanza: quien lo llama
 * trata cualquier fallo como "sin puntaje" y retiene el contenido.
 */
export interface ModerationPort {
  analyze(request: ModerationRequest): Promise<ModerationAnalysis>;
}
