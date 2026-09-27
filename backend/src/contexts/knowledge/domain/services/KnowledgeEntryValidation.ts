import {
  KNOWLEDGE_ENTRY_FIELDS,
  REQUIRED_KNOWLEDGE_ENTRY_FIELDS,
  type KnowledgeEntryData,
  type KnowledgeEntryField
} from '../entities/KnowledgeEntry.js';

/** Esquema de la base de conocimiento, leido de `config/knowledge-base.json`: cambiarlo no requiere tocar el codigo. */
export interface KnowledgeBaseSchema {
  readonly categories: readonly { readonly id: string; readonly name: string }[];
  readonly limits: {
    readonly titleMaxLength: number;
    readonly contentMaxLength: number;
    readonly keywordsMaxItems: number;
    readonly keywordMaxLength: number;
  };
  readonly search: { readonly defaultLimit: number; readonly maxLimit: number };
}

export interface KnowledgeEntryIssue {
  /** Campo del formulario al que se refiere, para que el panel lo senale. */
  readonly field: string;
  readonly message: string;
}

export type KnowledgeEntryValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly KnowledgeEntryIssue[] };

const MISSING_FIELD: Readonly<Record<KnowledgeEntryField, string>> = {
  title: 'Falta el título',
  content: 'Falta el contenido',
  category: 'Falta la categoría',
  keywords: 'Faltan las palabras clave'
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Validacion en servidor (HU-41 criterio 5). Recibe el cuerpo sin tipo, como
 * llegara de la capa HTTP, y devuelve todos los problemas a la vez. Ocultar un
 * campo en el panel no es validar.
 */
export function validateNewKnowledgeEntry(
  form: Readonly<Record<string, unknown>>,
  schema: KnowledgeBaseSchema
): KnowledgeEntryValidation<KnowledgeEntryData> {
  const issues: KnowledgeEntryIssue[] = [...unknownFieldIssues(form)];
  const values: Partial<Record<KnowledgeEntryField, unknown>> = {};

  for (const field of KNOWLEDGE_ENTRY_FIELDS) {
    if (isBlank(form[field])) {
      if (REQUIRED_KNOWLEDGE_ENTRY_FIELDS.includes(field)) issues.push({ field, message: `${MISSING_FIELD[field]}.` });
      continue;
    }
    collect(field, form[field], schema, values, issues);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { keywords: [], ...values } as unknown as KnowledgeEntryData };
}

/** Edicion: solo los campos enviados, cada uno con la misma validacion que al crear. */
export function validateKnowledgeEntryChanges(
  form: Readonly<Record<string, unknown>>,
  schema: KnowledgeBaseSchema
): KnowledgeEntryValidation<Partial<KnowledgeEntryData>> {
  const issues: KnowledgeEntryIssue[] = [...unknownFieldIssues(form)];
  const values: Partial<Record<KnowledgeEntryField, unknown>> = {};

  for (const field of KNOWLEDGE_ENTRY_FIELDS) {
    if (form[field] === undefined) continue;
    // Las palabras clave se pueden vaciar enviando una lista vacia.
    if (field !== 'keywords' && isBlank(form[field])) {
      issues.push({ field, message: `${MISSING_FIELD[field]}.` });
      continue;
    }
    collect(field, form[field], schema, values, issues);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: values as Partial<KnowledgeEntryData> };
}

function unknownFieldIssues(form: Readonly<Record<string, unknown>>): KnowledgeEntryIssue[] {
  return Object.keys(form)
    .filter((field) => !(KNOWLEDGE_ENTRY_FIELDS as readonly string[]).includes(field))
    .map((field) => ({ field, message: `El campo "${field}" no existe en una entrada de la base de conocimiento.` }));
}

function collect(
  field: KnowledgeEntryField,
  raw: unknown,
  schema: KnowledgeBaseSchema,
  values: Partial<Record<KnowledgeEntryField, unknown>>,
  issues: KnowledgeEntryIssue[]
): void {
  const result = validateField(field, raw, schema);
  if (result.ok) values[field] = result.value;
  else issues.push(result.issue);
}

type FieldResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: KnowledgeEntryIssue };

function validateField(field: KnowledgeEntryField, raw: unknown, schema: KnowledgeBaseSchema): FieldResult {
  const fail = (message: string): FieldResult => ({ ok: false, issue: { field, message } });
  const { limits } = schema;

  switch (field) {
    case 'title':
    case 'content': {
      const max = field === 'title' ? limits.titleMaxLength : limits.contentMaxLength;
      const label = field === 'title' ? 'El título' : 'El contenido';
      if (typeof raw !== 'string') return fail(`${label} debe ser texto.`);
      const value = raw.trim();
      if (value.length > max) return fail(`${label} no puede superar ${max} caracteres.`);
      return { ok: true, value };
    }
    case 'category': {
      if (typeof raw !== 'string') return fail('La categoría debe ser texto.');
      const value = raw.trim();
      if (!schema.categories.some((category) => category.id === value)) {
        return fail(`La categoría "${value}" no existe. Opciones: ${schema.categories.map((category) => category.id).join(', ')}.`);
      }
      return { ok: true, value };
    }
    case 'keywords': {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) return fail('Las palabras clave deben ser una lista de textos.');
      const unique = [...new Set((raw as string[]).map((item) => item.trim().toLowerCase()).filter((item) => item !== ''))];
      if (unique.length > limits.keywordsMaxItems) return fail(`Se permiten como máximo ${limits.keywordsMaxItems} palabras clave.`);
      if (unique.some((item) => item.length > limits.keywordMaxLength)) return fail(`Cada palabra clave puede tener como máximo ${limits.keywordMaxLength} caracteres.`);
      return { ok: true, value: unique };
    }
  }
}
