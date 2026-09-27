import type { InstitutionalProgramCatalog } from '../../../targeting/domain/ports/out/ProgramCatalogPort.js';
import {
  allCommunityTargeting,
  facultyTargeting,
  programTargeting,
  type ProgramTargeting
} from '../../../targeting/domain/value-objects/ProgramTargeting.js';
import {
  PRACTICE_MODALITIES,
  PRACTICE_OFFER_FIELDS,
  PRACTICE_OFFER_LIMITS,
  type PracticeModality,
  type PracticeOfferData,
  type PracticeOfferField
} from '../entities/PracticeOffer.js';

export interface PracticeOfferIssue {
  /** Campo del formulario al que se refiere, para que la interfaz lo senale. */
  readonly field: string;
  readonly message: string;
}

export type PracticeOfferValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly PracticeOfferIssue[] };

/** Mensaje de campo faltante, con la concordancia de cada campo ("Faltan los requisitos"). */
export const MISSING_FIELD: Readonly<Record<PracticeOfferField, string>> = {
  company: 'Falta la empresa',
  description: 'Falta la descripción',
  requirements: 'Faltan los requisitos',
  modality: 'Falta la modalidad',
  targeting: 'Faltan los programas destinatarios',
  dueDate: 'Falta la fecha de cierre',
  applicationChannel: 'Falta el canal de postulación'
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidationContext {
  readonly catalog: InstitutionalProgramCatalog;
  readonly now: Date;
}

/**
 * Validacion en servidor del formulario de carga manual (HU-24 criterio 3).
 * Recibe el cuerpo sin tipo, como llegara de la capa HTTP, y devuelve todos
 * los problemas a la vez, cada uno con su campo: el administrador corrige el
 * formulario de una sola vez. Ocultar un campo en la interfaz no es validar.
 */
export function validateNewPracticeOffer(
  form: Readonly<Record<string, unknown>>,
  context: ValidationContext
): PracticeOfferValidation<PracticeOfferData> {
  const issues: PracticeOfferIssue[] = [...unknownFieldIssues(form)];
  const values: Partial<Record<PracticeOfferField, unknown>> = {};

  for (const field of PRACTICE_OFFER_FIELDS) {
    if (isBlank(form[field])) {
      issues.push({ field, message: `${MISSING_FIELD[field]}.` });
      continue;
    }
    const result = validateField(field, form[field], context);
    if (result.ok) values[field] = result.value;
    else issues.push(result.issue);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: values as unknown as PracticeOfferData };
}

/**
 * Edicion (criterio 5): solo los campos enviados, cada uno con la misma
 * validacion que al crear. La empresa no se edita: forma el asunto de la
 * convocatoria, que es parte de su identidad.
 */
export function validatePracticeOfferChanges(
  form: Readonly<Record<string, unknown>>,
  context: ValidationContext
): PracticeOfferValidation<Partial<Omit<PracticeOfferData, 'company'>>> {
  const issues: PracticeOfferIssue[] = [];
  if ('company' in form) {
    issues.push({
      field: 'company',
      message: 'La empresa no se puede editar: identifica la oferta. Retírala y publica una nueva.'
    });
  }
  issues.push(...unknownFieldIssues(form));

  const values: Partial<Record<PracticeOfferField, unknown>> = {};
  for (const field of PRACTICE_OFFER_FIELDS) {
    if (field === 'company' || !(field in form)) continue;
    if (isBlank(form[field])) {
      issues.push({ field, message: `${MISSING_FIELD[field]}: no se puede dejar vacío.` });
      continue;
    }
    const result = validateField(field, form[field], context);
    if (result.ok) values[field] = result.value;
    else issues.push(result.issue);
  }

  if (issues.length === 0 && Object.keys(values).length === 0) {
    issues.push({ field: '*', message: 'No se envió ningún cambio.' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: values as Partial<Omit<PracticeOfferData, 'company'>> };
}

type FieldResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: PracticeOfferIssue };

function validateField(field: PracticeOfferField, raw: unknown, context: ValidationContext): FieldResult {
  const fail = (message: string): FieldResult => ({ ok: false, issue: { field, message } });
  switch (field) {
    case 'company':
      return text(raw, PRACTICE_OFFER_LIMITS.companyMax, fail);
    case 'description':
      return text(raw, PRACTICE_OFFER_LIMITS.descriptionMax, fail);
    case 'requirements':
      return text(raw, PRACTICE_OFFER_LIMITS.requirementsMax, fail);
    case 'modality':
      return PRACTICE_MODALITIES.includes(raw as PracticeModality)
        ? { ok: true, value: raw }
        : fail(`La modalidad debe ser una de: ${PRACTICE_MODALITIES.join(', ')}.`);
    case 'targeting':
      return targeting(raw, context.catalog, fail);
    case 'dueDate':
      return dueDate(raw, context.now, fail);
    case 'applicationChannel':
      return channel(raw, fail);
  }
}

function text(raw: unknown, max: number, fail: (message: string) => FieldResult): FieldResult {
  if (typeof raw !== 'string') return fail('Debe ser texto.');
  const clean = raw.trim();
  if (clean.length > max) return fail(`Admite hasta ${max} caracteres.`);
  return { ok: true, value: clean };
}

function targeting(raw: unknown, catalog: InstitutionalProgramCatalog, fail: (message: string) => FieldResult): FieldResult {
  const value = raw as Partial<Record<string, unknown>> | null;
  switch (typeof value === 'object' && value !== null ? value['kind'] : undefined) {
    case 'all-community':
      return { ok: true, value: allCommunityTargeting() };
    case 'faculty': {
      const facultyId = value!['facultyId'];
      if (typeof facultyId !== 'string' || !catalog.faculties.some((faculty) => faculty.id === facultyId)) {
        return fail(`La facultad "${String(facultyId)}" no está en el catálogo institucional.`);
      }
      return { ok: true, value: facultyTargeting(facultyId) };
    }
    case 'programs': {
      const ids = value!['programIds'];
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string' && id.trim() !== '')) {
        return fail('Indica al menos un programa destinatario.');
      }
      const known = new Set(catalog.programs.map((program) => program.id));
      const unknown = ids.filter((id: string) => !known.has(id));
      if (unknown.length > 0) return fail(`Programas fuera del catálogo institucional: ${unknown.join(', ')}.`);
      return { ok: true, value: programTargeting(ids as string[]) satisfies ProgramTargeting };
    }
    default:
      return fail('Los programas destinatarios deben ser toda la comunidad, una facultad o una lista de programas.');
  }
}

function dueDate(raw: unknown, now: Date, fail: (message: string) => FieldResult): FieldResult {
  const date = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null;
  if (date === null || Number.isNaN(date.getTime())) return fail('La fecha de cierre no es una fecha válida.');
  if (date.getTime() <= now.getTime()) return fail('La fecha de cierre ya pasó: una oferta cerrada no llega a ningún estudiante.');
  return { ok: true, value: date };
}

function channel(raw: unknown, fail: (message: string) => FieldResult): FieldResult {
  if (typeof raw !== 'string') return fail('Debe ser texto.');
  const clean = raw.trim();
  if (EMAIL.test(clean)) return { ok: true, value: `mailto:${clean}` };
  try {
    const url = new URL(clean);
    if (url.protocol === 'https:' || url.protocol === 'http:') return { ok: true, value: url.toString() };
  } catch {
    // cae al rechazo de abajo
  }
  return fail('El canal de postulación debe ser un enlace http(s) o un correo electrónico.');
}

function unknownFieldIssues(form: Readonly<Record<string, unknown>>): PracticeOfferIssue[] {
  const known: readonly string[] = PRACTICE_OFFER_FIELDS;
  return Object.keys(form)
    .filter((key) => !known.includes(key))
    .map((field) => ({ field, message: 'Campo no admitido en una oferta de práctica.' }));
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
