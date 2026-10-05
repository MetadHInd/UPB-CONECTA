const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * HU-47, criterio 7: neutraliza marcado embebido en texto libre (por
 * ejemplo, `<script>` en una publicacion del foro) sin rechazar la entrada
 * completa. Se eligio codificar en vez de eliminar o rechazar:
 *
 * - Eliminar etiquetas (`<script>...</script>` -> '') puede dejar texto
 *   ilegible o con significado distinto al que escribio el estudiante.
 * - Rechazar la publicacion completa (tratar `<` como caracter prohibido)
 *   es hostil con un texto legitimo que use `<`/`>` como puntuacion (por
 *   ejemplo, "2 < 3 creditos").
 * - Codificar preserva el texto visible tal cual lo escribio el autor y
 *   garantiza que, si algun cliente futuro llegara a renderizar este texto
 *   como HTML (hoy Jetpack Compose no lo hace: pinta texto plano, no HTML),
 *   el marcado nunca se interpreta como ejecutable.
 *
 * Se aplica una sola vez, en el unico punto donde el texto entra al
 * dominio (por ejemplo, `CreatePost`) — no esta pensada para volver a
 * pasarse sobre un texto ya codificado.
 */
export function neutralizeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
