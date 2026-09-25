/**
 * HU-51, criterio 6: "dado una metrica que cruza su umbral objetivo, cuando
 * se detecta, entonces se resalta como alerta en el tablero". Politica de
 * dominio pura, sin I/O — mismo estilo que `authorize(...)` (HU-46) y
 * `ConsentPolicy.evaluate(...)` (HU-44): recibe valores ya calculados y
 * decide, no calcula ni consulta nada por su cuenta.
 *
 * Dos familias de metricas, dos direcciones de "cruzar el umbral":
 * - **Piso** (`no-debe-caer-bajo`): precision y cobertura (RNF-25/RNF-26) son
 *   "cuanto mejor, mas alto"; el umbral es un minimo aceptable. Cruzarlo es
 *   caer *por debajo*.
 * - **Techo** (`no-debe-superar`): proporcion de cuarentena y tasa de
 *   correccion manual son "cuanto mejor, mas bajo"; el umbral es un maximo
 *   tolerable. Cruzarlo es *superarlo*.
 *
 * El limite exacto **no** es alerta, en ambas direcciones — misma convencion
 * que `PublicationDecisionPolicy` (HU-10) usa para el umbral de revision
 * ("estrictamente menor al umbral -> revision pendiente; igual o mayor ->
 * publicado"): el valor exactamente en el umbral todavia cumple el objetivo.
 *
 * Sin dato evaluable (`value === null`, por ejemplo un periodo sin mensajes
 * clasificados o sin muestra etiquetada), no hay alerta: no se afirma una
 * degradacion que los datos no permiten calcular, mismo principio que
 * `ComputeClassificationPrecision`/`ComputeCoverageMetric` devuelven `null`
 * en vez de forzar 0 o 100%. Es un tercer estado explicito (`sin-datos`), no
 * un `normal` disfrazado, para que el tablero pueda distinguir "esta bien" de
 * "no hay con que saberlo".
 */
export type MetricAlertDirection = 'no-debe-caer-bajo' | 'no-debe-superar';

export type MetricAlertStatus = 'sin-datos' | 'normal' | 'alerta';

export interface DashboardMetricAlert {
  readonly metric: string;
  readonly value: number | null;
  readonly threshold: number;
  readonly direction: MetricAlertDirection;
  readonly status: MetricAlertStatus;
}

export function evaluateMetricAlert(
  metric: string,
  value: number | null,
  threshold: number,
  direction: MetricAlertDirection
): DashboardMetricAlert {
  if (value === null) {
    return { metric, value, threshold, direction, status: 'sin-datos' };
  }
  const crossed = direction === 'no-debe-caer-bajo' ? value < threshold : value > threshold;
  return { metric, value, threshold, direction, status: crossed ? 'alerta' : 'normal' };
}
