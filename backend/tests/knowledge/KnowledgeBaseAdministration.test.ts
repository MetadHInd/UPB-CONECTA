import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KnowledgeFailureKind } from '../../src/contexts/knowledge/application/KnowledgeEntryResults.js';
import { KnowledgeAuditEventKind } from '../../src/contexts/knowledge/domain/ports/out/KnowledgeAuditLogPort.js';
import { ADMIN, buildKnowledgeHarness, SCHEMA, T0, validForm } from './knowledgeHarness.js';

type Harness = ReturnType<typeof buildKnowledgeHarness>;

async function publishValid(kb: Harness, overrides: Record<string, unknown> = {}) {
  const result = await kb.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });
  if (!result.ok) throw new Error(result.message);
  return result.entry;
}

const HOUR = 3_600_000;

describe('HU-41 — base de conocimiento institucional administrable sin despliegue (RF-66, RNF-15, RNF-18)', () => {
  describe('criterio 1 — crear, editar y retirar desde el panel, sin desarrollo', () => {
    it('crea una entrada con sus campos, en versión 1 y sin retiro', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      expect(entry).toMatchObject({
        title: 'Fechas de matrícula 2026-2',
        category: 'matriculas',
        keywords: ['matrícula', 'pagos'],
        version: 1,
        createdBy: ADMIN,
        createdAt: T0,
        withdrawnAt: null,
        history: []
      });
      expect(await kb.entries.findById(entry.id)).toEqual(entry);
    });

    it('edita título, contenido, categoría y palabras clave', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      kb.setNow(new Date(T0.getTime() + HOUR));

      const result = await kb.edit.execute({
        entryId: entry.id,
        form: { content: 'Nuevo contenido vigente.', category: 'tramites', keywords: ['pagos'] },
        editedBy: 'otra@upb.edu.co'
      });

      if (!result.ok) throw new Error(result.message);
      expect(result.changedFields).toEqual(['content', 'category', 'keywords']);
      expect(result.entry).toMatchObject({ title: entry.title, content: 'Nuevo contenido vigente.', category: 'tramites', keywords: ['pagos'], version: 2, updatedBy: 'otra@upb.edu.co' });
    });

    it('editar sin cambios reales no crea versión ni auditoría', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      const result = await kb.edit.execute({ entryId: entry.id, form: { title: entry.title }, editedBy: ADMIN });
      if (!result.ok) throw new Error(result.message);
      expect(result.changedFields).toEqual([]);
      expect(result.entry.version).toBe(1);
      expect(kb.auditLog.events.filter((e) => e.kind === KnowledgeAuditEventKind.EDITED)).toHaveLength(0);
    });

    it('retira la entrada sin borrarla', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      const result = await kb.withdraw.execute({ entryId: entry.id, withdrawnBy: ADMIN });
      if (!result.ok) throw new Error(result.message);
      expect(result.entry).toMatchObject({ withdrawnAt: T0, withdrawnBy: ADMIN });
      expect(await kb.entries.findById(entry.id)).not.toBeNull();
    });

    it('retirar dos veces, o editar/retirar una inexistente, se informa', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      await kb.withdraw.execute({ entryId: entry.id, withdrawnBy: ADMIN });
      expect(await kb.withdraw.execute({ entryId: entry.id, withdrawnBy: ADMIN })).toMatchObject({ ok: false, error: KnowledgeFailureKind.ENTRY_WITHDRAWN });
      expect(await kb.edit.execute({ entryId: entry.id, form: { title: 'x' }, editedBy: ADMIN })).toMatchObject({ ok: false, error: KnowledgeFailureKind.ENTRY_WITHDRAWN });
      expect(await kb.withdraw.execute({ entryId: 'nope', withdrawnBy: ADMIN })).toMatchObject({ ok: false, error: KnowledgeFailureKind.ENTRY_NOT_FOUND });
      expect(await kb.edit.execute({ entryId: 'nope', form: { title: 'x' }, editedBy: ADMIN })).toMatchObject({ ok: false, error: KnowledgeFailureKind.ENTRY_NOT_FOUND });
    });

    it('el listado de administración incluye las retiradas y permite filtrar por estado', async () => {
      const kb = buildKnowledgeHarness();
      const a = await publishValid(kb);
      const b = await publishValid(kb, { title: 'Otra' });
      await kb.withdraw.execute({ entryId: b.id, withdrawnBy: ADMIN });
      expect((await kb.list.execute({})).map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
      expect((await kb.list.execute({ status: 'active' })).map((e) => e.id)).toEqual([a.id]);
      expect((await kb.list.execute({ status: 'withdrawn' })).map((e) => e.id)).toEqual([b.id]);
    });

    it('las operaciones quedan registradas para el rol content-admin en el catálogo de HU-46', () => {
      const catalog = JSON.parse(readFileSync(new URL('../../config/protected-operations.json', import.meta.url), 'utf8')) as {
        operations: { operation: string; requiredRole: string }[];
      };
      for (const operation of ['PublishKnowledgeEntry', 'EditKnowledgeEntry', 'WithdrawKnowledgeEntry', 'ListKnowledgeEntries', 'GetKnowledgeEntryHistory']) {
        expect(catalog.operations).toContainEqual({ operation, requiredRole: 'content-admin' });
      }
    });
  });

  describe('criterio 2 — una entrada nueva queda disponible para el chatbot sin redespliegue', () => {
    it('la búsqueda y la consulta por id la encuentran de inmediato, sin reconstruir nada', async () => {
      const kb = buildKnowledgeHarness();
      expect(await kb.knowledgeBase.search('matrícula')).toEqual([]);

      const entry = await publishValid(kb);

      const found = await kb.knowledgeBase.search('¿Cuándo es la matricula?');
      expect(found.map((source) => source.id)).toEqual([entry.id]);
      expect(found[0]).toMatchObject({ title: entry.title, content: entry.content, category: 'matriculas', version: 1 });
      expect(await kb.knowledgeBase.findById(entry.id)).toMatchObject({ id: entry.id });
    });

    it('ordena por relevancia (título y palabras clave pesan más que el contenido) y respeta el límite', async () => {
      const kb = buildKnowledgeHarness();
      const weak = await publishValid(kb, { title: 'Bienestar', content: 'Incluye apoyo con la beca de alimentación.', keywords: ['salud'], category: 'bienestar' });
      const strong = await publishValid(kb, { title: 'Beca de alimentación', content: 'Requisitos de la beca.', keywords: ['beca'], category: 'bienestar' });
      const results = await kb.knowledgeBase.search('beca alimentación');
      expect(results.map((r) => r.id)).toEqual([strong.id, weak.id]);
      expect(await kb.knowledgeBase.search('beca alimentación', { limit: 1 })).toHaveLength(1);
    });

    it('a igual relevancia gana la más recientemente actualizada', async () => {
      const kb = buildKnowledgeHarness();
      const older = await publishValid(kb, { title: 'Beca uno' });
      kb.setNow(new Date(T0.getTime() + HOUR));
      const newer = await publishValid(kb, { title: 'Beca dos' });
      expect((await kb.knowledgeBase.search('beca')).map((r) => r.id)).toEqual([newer.id, older.id]);
    });

    it('una consulta vacía, sin coincidencias o con límite no positivo no devuelve nada', async () => {
      const kb = buildKnowledgeHarness();
      await publishValid(kb);
      expect(await kb.knowledgeBase.search('   ')).toEqual([]);
      expect(await kb.knowledgeBase.search('astronomía')).toEqual([]);
      expect(await kb.knowledgeBase.search('matrícula', { limit: 0 })).toEqual([]);
    });
  });

  describe('criterio 3 — una entrada retirada no la usa el chatbot como fuente', () => {
    it('deja de aparecer en la búsqueda y en la consulta por id', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      await kb.withdraw.execute({ entryId: entry.id, withdrawnBy: ADMIN });
      expect(await kb.knowledgeBase.search('matrícula')).toEqual([]);
      expect(await kb.knowledgeBase.findById(entry.id)).toBeNull();
    });

    it('una entrada retirada no afecta a las vigentes', async () => {
      const kb = buildKnowledgeHarness();
      const kept = await publishValid(kb);
      const gone = await publishValid(kb, { title: 'Matrícula vieja' });
      await kb.withdraw.execute({ entryId: gone.id, withdrawnBy: ADMIN });
      expect((await kb.knowledgeBase.search('matrícula')).map((s) => s.id)).toEqual([kept.id]);
    });

    it('una consulta por un id inexistente devuelve null', async () => {
      expect(await buildKnowledgeHarness().knowledgeBase.findById('nope')).toBeNull();
    });
  });

  describe('criterio 4 — la edición conserva la versión anterior y la fecha del cambio', () => {
    it('guarda cada versión previa completa con quién y cuándo la reemplazó', async () => {
      const kb = buildKnowledgeHarness();
      const original = await publishValid(kb);
      kb.setNow(new Date(T0.getTime() + 2 * HOUR));
      await kb.edit.execute({ entryId: original.id, form: { content: 'Contenido corregido.' }, editedBy: 'editor@upb.edu.co' });
      kb.setNow(new Date(T0.getTime() + 5 * HOUR));
      const second = await kb.edit.execute({ entryId: original.id, form: { title: 'Título nuevo' }, editedBy: ADMIN });
      if (!second.ok) throw new Error(second.message);

      expect(second.entry.version).toBe(3);
      expect(second.entry.history).toEqual([
        { version: 1, title: original.title, content: original.content, category: 'matriculas', keywords: ['matrícula', 'pagos'], replacedAt: new Date(T0.getTime() + 2 * HOUR), replacedBy: 'editor@upb.edu.co' },
        { version: 2, title: original.title, content: 'Contenido corregido.', category: 'matriculas', keywords: ['matrícula', 'pagos'], replacedAt: new Date(T0.getTime() + 5 * HOUR), replacedBy: ADMIN }
      ]);
    });

    it('el chatbot solo ve la versión vigente, no las anteriores', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      await kb.edit.execute({ entryId: entry.id, form: { content: 'Contenido corregido con nuevas fechas.' }, editedBy: ADMIN });
      const [source] = await kb.knowledgeBase.search('matrícula');
      expect(source).toMatchObject({ content: 'Contenido corregido con nuevas fechas.', version: 2 });
      expect(JSON.stringify(source)).not.toContain('La matrícula ordinaria');
    });

    it('el historial devuelve versiones (la vigente incluida) y los eventos de auditoría', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      await kb.edit.execute({ entryId: entry.id, form: { title: 'Nuevo' }, editedBy: ADMIN });
      const result = await kb.history.execute({ entryId: entry.id });
      if (!result.ok) throw new Error(result.message);
      expect(result.versions.map((v) => v.version)).toEqual([1, 2]);
      expect(result.versions[1]).toMatchObject({ title: 'Nuevo', current: true });
      expect(result.versions[0]).toMatchObject({ current: false });
      expect(result.audit.map((e) => e.kind)).toEqual([KnowledgeAuditEventKind.CREATED, KnowledgeAuditEventKind.EDITED]);
      expect(await kb.history.execute({ entryId: 'nope' })).toMatchObject({ ok: false, error: KnowledgeFailureKind.ENTRY_NOT_FOUND });
    });
  });

  describe('criterio 5 — el servidor valida el esquema y rechaza la operación', () => {
    it('sin campos obligatorios rechaza y señala cada campo; no guarda ni audita', async () => {
      const kb = buildKnowledgeHarness();
      const result = await kb.publish.execute({ form: {}, publishedBy: ADMIN });
      expect(result).toMatchObject({ ok: false, error: KnowledgeFailureKind.INVALID_ENTRY });
      if (result.ok) return;
      expect(result.issues?.map((i) => i.field).sort()).toEqual(['category', 'content', 'title']);
      expect(await kb.list.execute({})).toEqual([]);
      expect(kb.auditLog.events).toEqual([]);
    });

    it('un campo de solo espacios cuenta como faltante', async () => {
      const kb = buildKnowledgeHarness();
      const result = await kb.publish.execute({ form: validForm({ title: '   ' }), publishedBy: ADMIN });
      expect(result).toMatchObject({ ok: false, issues: [{ field: 'title' }] });
    });

    it('rechaza tipos incorrectos, categoría fuera de la configuración, límites excedidos y campos desconocidos', async () => {
      const kb = buildKnowledgeHarness();
      const cases: [Record<string, unknown>, string][] = [
        [{ title: 42 }, 'title'],
        [{ title: 'x'.repeat(SCHEMA.limits.titleMaxLength + 1) }, 'title'],
        [{ content: 'y'.repeat(SCHEMA.limits.contentMaxLength + 1) }, 'content'],
        [{ category: 'inventada' }, 'category'],
        [{ category: 7 }, 'category'],
        [{ keywords: 'no-es-lista' }, 'keywords'],
        [{ keywords: [1] }, 'keywords'],
        [{ keywords: Array.from({ length: SCHEMA.limits.keywordsMaxItems + 1 }, (_, i) => `k${i}`) }, 'keywords'],
        [{ keywords: ['a'.repeat(SCHEMA.limits.keywordMaxLength + 1)] }, 'keywords'],
        [{ withdrawnAt: 'hoy' }, 'withdrawnAt']
      ];
      for (const [overrides, field] of cases) {
        const result = await kb.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });
        expect(result, field).toMatchObject({ ok: false, error: KnowledgeFailureKind.INVALID_ENTRY });
        if (!result.ok) expect(result.issues?.map((i) => i.field)).toContain(field);
      }
    });

    it('las palabras clave son opcionales', async () => {
      const kb = buildKnowledgeHarness();
      const { keywords: _omit, ...withoutKeywords } = validForm();
      const result = await kb.publish.execute({ form: withoutKeywords, publishedBy: ADMIN });
      expect(result).toMatchObject({ ok: true, entry: { keywords: [] } });
    });

    it('la edición valida igual, y no cambia nada si es inválida', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      const result = await kb.edit.execute({ entryId: entry.id, form: { title: '', category: 'inventada' }, editedBy: ADMIN });
      expect(result).toMatchObject({ ok: false, error: KnowledgeFailureKind.INVALID_ENTRY });
      expect(await kb.entries.findById(entry.id)).toEqual(entry);
      expect(await kb.edit.execute({ entryId: entry.id, form: { id: 'otro', keywords: 'x' }, editedBy: ADMIN })).toMatchObject({ ok: false });
    });

    it('neutraliza el HTML del contenido y elimina palabras clave repetidas', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb, { content: 'Hola <script>alert(1)</script>', keywords: ['Pagos', 'pagos', ' matrícula '] });
      expect(entry.content).not.toContain('<script>');
      expect(entry.keywords).toEqual(['pagos', 'matrícula']);
    });
  });

  describe('criterio 6 — todo cambio queda auditado con usuario, acción, objeto y marca de tiempo', () => {
    it('registra crear, editar y retirar', async () => {
      const kb = buildKnowledgeHarness();
      const entry = await publishValid(kb);
      kb.setNow(new Date(T0.getTime() + HOUR));
      await kb.edit.execute({ entryId: entry.id, form: { content: 'Otro texto.' }, editedBy: 'editor@upb.edu.co' });
      kb.setNow(new Date(T0.getTime() + 2 * HOUR));
      await kb.withdraw.execute({ entryId: entry.id, withdrawnBy: 'retira@upb.edu.co' });

      expect(kb.auditLog.events).toEqual([
        { kind: KnowledgeAuditEventKind.CREATED, entryId: entry.id, actor: ADMIN, occurredAt: T0, version: 1 },
        { kind: KnowledgeAuditEventKind.EDITED, entryId: entry.id, actor: 'editor@upb.edu.co', occurredAt: new Date(T0.getTime() + HOUR), version: 2, changedFields: ['content'] },
        { kind: KnowledgeAuditEventKind.WITHDRAWN, entryId: entry.id, actor: 'retira@upb.edu.co', occurredAt: new Date(T0.getTime() + 2 * HOUR), version: 2 }
      ]);
    });

    it('las operaciones rechazadas no dejan rastro de cambio', async () => {
      const kb = buildKnowledgeHarness();
      await kb.publish.execute({ form: {}, publishedBy: ADMIN });
      await kb.withdraw.execute({ entryId: 'nope', withdrawnBy: ADMIN });
      expect(kb.auditLog.events).toEqual([]);
    });
  });
});
