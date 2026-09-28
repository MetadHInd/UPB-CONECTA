import { describe, expect, it } from 'vitest';
import { SimulateModerationThresholds } from '../../src/contexts/moderation/application/SimulateModerationThresholds.js';
import type { AutomaticModerationRecordPort } from '../../src/contexts/moderation/domain/ports/out/AutomaticModerationRecordPort.js';
import type { ModerationAnalysis, ModerationPort, ModerationRequest } from '../../src/contexts/moderation/domain/ports/out/ModerationPort.js';
import { ModerationReason, ModerationVerdict } from '../../src/contexts/moderation/domain/services/ModerationDecisionPolicy.js';
import { ModerationThresholds } from '../../src/contexts/moderation/domain/value-objects/ModerationThresholds.js';
import { InMemoryAutomaticModerationRecords } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryAutomaticModerationRecords.js';
import { InMemoryModerationAdapter } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationAdapter.js';
import { InMemoryModerationLabeledSamples } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationLabeledSamples.js';
import { InMemoryModerationRulesRepository } from '../../src/contexts/moderation/infrastructure/adapters/out/memory/InMemoryModerationRulesRepository.js';
import { PostRejectionKind } from '../../src/contexts/forum/application/CreatePost.js';
import { buildForumHarness } from '../forum/forumHarness.js';

const ANA = 'ana@upb.edu.co';
const ADMIN = 'moderacion@upb.edu.co';

type Forum = ReturnType<typeof buildForumHarness>;

async function forumWithAna(options: Parameters<typeof buildForumHarness>[0] = {}): Promise<Forum> {
  const forum = buildForumHarness(options);
  await forum.seed.execute(forum.seedTopics);
  await forum.login('ana');
  return forum;
}

async function post(forum: Forum, text: string, score = 0.05, title = 'Consulta') {
  forum.moderationPort.script = { score };
  const result = await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title, text } });
  return result;
}

/** Id del contenido evaluado, publicado o no: la moderación registra cada decisión. */
function lastRecord(forum: Forum) {
  const records = (forum.moderationRecords as InMemoryAutomaticModerationRecords).records;
  return records[records.length - 1]!;
}

describe('HU-52 — gestión de reglas de moderación y auditoría completa de las decisiones (RF-77, RF-78)', () => {
  describe('criterio 1 — los umbrales se ajustan sin redespliegue', () => {
    it('el ajuste aplica a la siguiente evaluación', async () => {
      const forum = await forumWithAna();
      expect(await post(forum, 'Texto dudoso', 0.5)).toMatchObject({ ok: false, error: PostRejectionKind.RETAINED_FOR_REVIEW });

      await forum.manageModerationRules.updateThresholds({ lower: 0.6, performedBy: ADMIN });

      expect(await post(forum, 'Texto dudoso', 0.5)).toMatchObject({ ok: true });
      await forum.manageModerationRules.updateThresholds({ upper: 0.7, performedBy: ADMIN });
      expect(await post(forum, 'Texto fuerte', 0.75)).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });
    });

    it.each([
      [{ lower: 0.8, upper: 0.4 }],
      [{ lower: 0.5, upper: 0.5 }],
      [{ lower: -0.1 }],
      [{ upper: 1.5 }],
      [{ lower: Number.NaN }]
    ])('rechaza %j sin cambiar nada ni auditar', async (values) => {
      const forum = await forumWithAna();

      const result = await forum.manageModerationRules.updateThresholds({ ...values, performedBy: ADMIN });

      expect(result).toMatchObject({ ok: false, error: 'invalid-thresholds' });
      expect((await forum.manageModerationRules.get()).rules.thresholds).toMatchObject({ lower: 0.4, upper: 0.8 });
      expect(await forum.manageModerationRules.history()).toEqual([]);
    });
  });

  describe('criterio 2 — el diccionario se ajusta sin modificar código', () => {
    it('una expresión agregada bloquea desde la siguiente publicación, y una retirada deja de bloquear', async () => {
      const forum = await forumWithAna();
      expect(await post(forum, 'Qué gonorrea de parcial')).toMatchObject({ ok: true });
      expect(await post(forum, 'No seas idiota')).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });

      expect(await forum.manageModerationRules.addBannedTerm({ term: '  gonorrea ', performedBy: ADMIN })).toMatchObject({ ok: true, changed: true });
      expect(await forum.manageModerationRules.removeBannedTerm({ term: 'IDIOTA', performedBy: ADMIN })).toMatchObject({ ok: true });

      expect(await post(forum, 'Qué gonorrea de parcial')).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });
      expect(await post(forum, 'No seas idiota')).toMatchObject({ ok: true });
      expect((await forum.manageModerationRules.get()).rules.bannedTerms).toEqual(['hijo de puta', 'gonorrea']);
    });

    it('una expresión de varias palabras se guarda sin espacios sobrantes', async () => {
      const forum = await forumWithAna();

      await forum.manageModerationRules.addBannedTerm({ term: 'puta   madre', performedBy: ADMIN });

      expect((await forum.manageModerationRules.get()).rules.bannedTerms).toContain('puta madre');
      expect(await post(forum, 'Qué puta madre')).toMatchObject({ ok: false, error: PostRejectionKind.BLOCKED_BY_MODERATION });
    });

    it('rechaza duplicados (sin distinguir mayúsculas ni tildes), vacíos, demasiado largos y retirar lo que no está', async () => {
      const forum = await forumWithAna();
      const manage = forum.manageModerationRules;

      expect(await manage.addBannedTerm({ term: 'ÍDIOTA', performedBy: ADMIN })).toMatchObject({ ok: false, error: 'term-already-banned' });
      expect(await manage.addBannedTerm({ term: '   ', performedBy: ADMIN })).toMatchObject({ ok: false, error: 'invalid-term' });
      expect(await manage.addBannedTerm({ term: 'x'.repeat(81), performedBy: ADMIN })).toMatchObject({ ok: false, error: 'invalid-term' });
      expect(await manage.removeBannedTerm({ term: 'gonorrea', performedBy: ADMIN })).toMatchObject({ ok: false, error: 'term-not-banned' });
      expect(await manage.history()).toEqual([]);
    });
  });

  describe('criterio 3 — cada cambio de umbral queda auditado', () => {
    it('con el valor anterior, el nuevo, el administrador y la marca de tiempo', async () => {
      const forum = await forumWithAna();
      const at = forum.now();

      await forum.manageModerationRules.updateThresholds({ lower: 0.3, upper: 0.9, performedBy: ADMIN });

      expect(await forum.manageModerationRules.history()).toEqual([
        { kind: 'thresholds-changed', previous: { lower: 0.4, upper: 0.8 }, next: { lower: 0.3, upper: 0.9 }, performedBy: ADMIN, occurredAt: at }
      ]);
      expect(await forum.manageModerationRules.get()).toMatchObject({ updatedBy: ADMIN, updatedAt: at });
    });

    it('un ajuste sin cambios no escribe ni audita', async () => {
      const forum = await forumWithAna();

      const result = await forum.manageModerationRules.updateThresholds({ lower: 0.4, upper: 0.8, performedBy: ADMIN });

      expect(result).toMatchObject({ ok: true, changed: false, rules: { updatedBy: null } });
      expect(await forum.manageModerationRules.history()).toEqual([]);
    });

    it('los cambios del diccionario también se auditan, el más reciente primero', async () => {
      const forum = await forumWithAna();
      await forum.manageModerationRules.addBannedTerm({ term: 'gonorrea', performedBy: ADMIN });
      forum.advanceHours(1);
      await forum.manageModerationRules.removeBannedTerm({ term: 'Idiota', performedBy: 'otra@upb.edu.co' });

      expect(await forum.manageModerationRules.history()).toEqual([
        { kind: 'banned-term-removed', term: 'idiota', performedBy: 'otra@upb.edu.co', occurredAt: forum.now() },
        expect.objectContaining({ kind: 'banned-term-added', term: 'gonorrea', performedBy: ADMIN })
      ]);
    });
  });

  describe('criterio 4 — cada decisión conserva texto, puntaje, umbral y decisión automática', () => {
    it('también la de publicar', async () => {
      const forum = await forumWithAna();

      const result = await post(forum, 'Hola a todos', 0.12, 'Saludo');

      expect(result.ok).toBe(true);
      expect(lastRecord(forum)).toMatchObject({
        contentId: result.ok ? result.post.id : '',
        contentKind: 'post',
        evaluatedText: 'Saludo\nHola a todos',
        score: 0.12,
        thresholds: { lower: 0.4, upper: 0.8 },
        matchedTerms: [],
        verdict: ModerationVerdict.PUBLISH,
        reason: ModerationReason.BELOW_LOWER_THRESHOLD,
        decidedAt: forum.now(),
        resolutions: []
      });
    });

    it('retener y bloquear, con las expresiones que coincidieron y los umbrales vigentes en ese momento', async () => {
      const forum = await forumWithAna();
      await post(forum, 'Texto dudoso', 0.5);
      const retained = lastRecord(forum);
      await forum.manageModerationRules.updateThresholds({ lower: 0.2, upper: 0.6, performedBy: ADMIN });
      await post(forum, 'Eres un IDIOTA', 0.1);

      expect(retained).toMatchObject({ score: 0.5, thresholds: { lower: 0.4, upper: 0.8 }, verdict: 'retain', reason: 'between-thresholds' });
      expect(lastRecord(forum)).toMatchObject({
        score: 0.1,
        thresholds: { lower: 0.2, upper: 0.6 },
        matchedTerms: ['idiota'],
        verdict: 'block',
        reason: 'banned-term'
      });
      expect((forum.moderationRecords as InMemoryAutomaticModerationRecords).records[0]).toEqual(retained);
    });

    it('sin puntaje del servicio registra el puntaje vacío y el marcado del texto neutralizado', async () => {
      const forum = await forumWithAna();
      forum.moderationPort.script = 'fail';

      await forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body: { title: 'Aviso', text: '<script>alert(1)</script>' } });

      const record = lastRecord(forum);
      expect(record).toMatchObject({ score: null, verdict: 'retain', reason: 'service-unavailable' });
      expect(record.evaluatedText).not.toContain('<script>');
    });

    it('si el registro falla, nada se publica', async () => {
      const failing: AutomaticModerationRecordPort = {
        record: async () => {
          throw new Error('registro no disponible');
        },
        appendResolution: async () => false,
        findByContentId: async () => []
      };
      const forum = await forumWithAna({ moderationRecords: failing });

      await expect(post(forum, 'Hola a todos')).rejects.toThrow('registro no disponible');
      expect(await forum.posts.findByTopic('general')).toEqual([]);
    });
  });

  describe('criterio 5 — la resolución humana se anexa sin sobrescribir la decisión automática', () => {
    it.each([
      ['aprobar', 'approved'],
      ['rechazar', 'rejected']
    ] as const)('al %s, la decisión automática queda intacta y la resolución se agrega', async (action, outcome) => {
      const forum = await forumWithAna();
      await post(forum, 'Texto dudoso', 0.5);
      const automatic = structuredClone(lastRecord(forum));
      forum.advanceHours(3);

      const resolved =
        action === 'aprobar'
          ? await forum.approveRetained.execute({ contentId: automatic.contentId, reviewer: ADMIN })
          : await forum.rejectRetained.execute({ contentId: automatic.contentId, reviewer: ADMIN });

      expect(resolved.ok).toBe(true);
      const [record] = await forum.moderationRecords.findByContentId(automatic.contentId);
      expect(record).toEqual({ ...automatic, resolutions: [{ outcome, reviewer: ADMIN, category: 'other', resolvedAt: forum.now() }] });
    });
  });

  describe('criterio 6 — ante una impugnación, el registro trae el fragmento y la categoría', () => {
    it('desde el historial del estudiante hasta los fundamentos de cada bloqueo', async () => {
      const forum = await forumWithAna();
      await post(forum, 'No seas idiota con los demás', 0.1);
      await post(forum, 'Un texto muy ofensivo', 0.95);

      const history = await forum.history.execute({ studentEmail: ANA });
      const views = await Promise.all(history.contents.map((entry) => forum.decisionRecord.execute({ contentId: entry.content.id })));

      expect(views.map((view) => view?.grounds)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'other',
            norm: expect.objectContaining({ code: 'NC-07' }),
            fragment: 'No seas idiota con los demás',
            matchedTerms: ['idiota'],
            source: 'automatic'
          }),
          expect.objectContaining({ category: 'other', fragment: 'Un texto muy ofensivo', matchedTerms: [] })
        ])
      );
      expect(views.every((view) => view?.decisions.length === 1 && view.decisions[0]!.verdict === 'block')).toBe(true);
    });

    it('lo que una persona aprobó ya no tiene fundamentos de infracción, y lo rechazado muestra al revisor', async () => {
      const forum = await forumWithAna();
      await post(forum, 'Texto dudoso uno', 0.5);
      const approved = lastRecord(forum).contentId;
      await post(forum, 'Texto dudoso dos', 0.5);
      const rejected = lastRecord(forum).contentId;
      await forum.approveRetained.execute({ contentId: approved, reviewer: ADMIN });
      await forum.rejectRetained.execute({ contentId: rejected, reviewer: ADMIN });

      expect((await forum.decisionRecord.execute({ contentId: approved }))?.grounds).toBeNull();
      expect((await forum.decisionRecord.execute({ contentId: rejected }))?.grounds).toMatchObject({
        fragment: 'Texto dudoso dos',
        decidedBy: ADMIN,
        source: 'human-review'
      });
    });

    it('un contenido sin registro devuelve null', async () => {
      const forum = await forumWithAna();
      expect(await forum.decisionRecord.execute({ contentId: 'no-existe' })).toBeNull();
    });
  });

  describe('criterio 7 — simular un umbral sobre el conjunto etiquetado antes de aplicarlo', () => {
    /** El stub puntúa 0.6 con una palabra ofensiva leve y 0.9 con una fuerte o dos leves. */
    const SAMPLES = [
      { sampleId: 's1', text: 'eres un tonto', offensive: true },
      { sampleId: 's2', text: 'malparido', offensive: true },
      { sampleId: 's3', text: 'tonto e imbecil', offensive: true },
      { sampleId: 's4', text: 'hola a todos', offensive: false },
      { sampleId: 's5', text: 'que asco de clima', offensive: false }
    ];

    async function build(options: { readonly moderation?: ModerationPort; readonly samples?: typeof SAMPLES; readonly bannedTerms?: string[] } = {}) {
      const rules = new InMemoryModerationRulesRepository({ thresholds: ModerationThresholds.of(0.4, 0.8), bannedTerms: options.bannedTerms ?? [] });
      const samples = new InMemoryModerationLabeledSamples();
      for (const sample of options.samples ?? SAMPLES) await samples.save(sample);
      const simulate = new SimulateModerationThresholds({ moderation: options.moderation ?? new InMemoryModerationAdapter(), rules, samples, timeoutMs: 100 });
      return { rules, simulate };
    }

    it('compara cobertura y falsos positivos de los umbrales vigentes y los propuestos', async () => {
      const { simulate } = await build();

      const result = await simulate.execute({ lower: 0.7, upper: 0.95 });

      if (!result.ok) throw new Error(result.message);
      expect(result.sampleSize).toBe(5);
      expect(result.current).toEqual({
        thresholds: { lower: 0.4, upper: 0.8 },
        offensive: { publish: 0, retain: 1, block: 2 },
        nonOffensive: { publish: 1, retain: 1, block: 0 },
        coverage: 1,
        falsePositiveRate: 0.5
      });
      expect(result.proposed).toEqual({
        thresholds: { lower: 0.7, upper: 0.95 },
        offensive: { publish: 1, retain: 2, block: 0 },
        nonOffensive: { publish: 2, retain: 0, block: 0 },
        coverage: 2 / 3,
        falsePositiveRate: 0
      });
      expect(result.delta.coverage).toBeCloseTo(-1 / 3);
      expect(result.delta.falsePositiveRate).toBe(-0.5);
    });

    it('no cambia las reglas vigentes', async () => {
      const { rules, simulate } = await build();

      await simulate.execute({ lower: 0.1, upper: 0.2 });

      expect(await rules.get()).toMatchObject({ rules: { thresholds: { lower: 0.4, upper: 0.8 } }, updatedBy: null });
    });

    it('aplica el diccionario vigente y retiene lo que el modelo no puntuó, como en producción', async () => {
      const failing: ModerationPort = {
        analyze: async (request: ModerationRequest): Promise<ModerationAnalysis> => {
          if (request.text.includes('clima')) throw new Error('caído');
          return { score: 0.05 };
        }
      };
      const { simulate } = await build({ moderation: failing, bannedTerms: ['malparido'] });

      const result = await simulate.execute({ lower: 0.4, upper: 0.8 });

      expect(result).toMatchObject({
        ok: true,
        unscored: 1,
        proposed: { offensive: { publish: 2, retain: 0, block: 1 }, nonOffensive: { publish: 1, retain: 1, block: 0 } }
      });
    });

    it('rechaza umbrales inválidos y avisa si no hay conjunto etiquetado', async () => {
      expect(await (await build()).simulate.execute({ lower: 0.9, upper: 0.1 })).toMatchObject({ ok: false, error: 'invalid-thresholds' });
      expect(await (await build({ samples: [] })).simulate.execute({ lower: 0.4, upper: 0.8 })).toMatchObject({
        ok: false,
        error: 'no-labeled-samples'
      });
    });
  });
});
