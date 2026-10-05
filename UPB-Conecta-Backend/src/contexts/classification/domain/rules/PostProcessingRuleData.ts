import type { MessageCategory } from '../value-objects/MessageCategory.js';

/**
 * Condicion de una regla, modelada como datos (no como codigo) para que un
 * administrador de contenido pueda declararla sin depender del equipo de
 * desarrollo (RF-13, criterio 5). `sender-matches` y `subject-matches` usan
 * una expresion regular (insensible a mayusculas) evaluada contra
 * `InstitutionalMessage.sender` o `.subject` respectivamente. `and`/`or`/`not`
 * permiten componer condiciones simples en una mas compleja.
 */
export type RuleConditionData =
  | { readonly type: 'sender-matches'; readonly pattern: string }
  | { readonly type: 'subject-matches'; readonly pattern: string }
  | { readonly type: 'and'; readonly conditions: readonly RuleConditionData[] }
  | { readonly type: 'or'; readonly conditions: readonly RuleConditionData[] }
  | { readonly type: 'not'; readonly condition: RuleConditionData };

/**
 * Accion de una regla cuando su condicion se cumple. `confirm` fija la
 * categoria final igual a la propuesta por el modelo, `correct` la reemplaza
 * por `category`, y `discard` envia el mensaje a revision humana en vez de
 * publicarlo (ver README de este contexto: decision sobre "descartar").
 */
export type RuleActionData =
  | { readonly type: 'confirm' }
  | { readonly type: 'correct'; readonly category: MessageCategory }
  | { readonly type: 'discard' };

/**
 * Una regla de posprocesamiento como estructura de datos serializable
 * (JSON-friendly), tal como exige el diseño de esta historia: "las reglas
 * son datos, no codigo". `precedence` es el numero de orden explicito que
 * resuelve el criterio 4 (determinismo): un numero menor se evalua primero.
 * Ante empate de precedencia, `PostProcessingRuleChain` desempata por `id`
 * ascendente para que el resultado no dependa del orden de lectura del
 * repositorio.
 */
export interface PostProcessingRuleData {
  readonly id: string;
  readonly precedence: number;
  readonly active: boolean;
  readonly condition: RuleConditionData;
  readonly action: RuleActionData;
  readonly description?: string;
}
