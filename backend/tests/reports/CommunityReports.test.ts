import { describe, expect, it } from 'vitest';
import { ReportRejectionKind } from '../../src/contexts/reports/application/ReportContent.js';
import { ReportReviewFailureKind } from '../../src/contexts/reports/application/ReviewReportedContent.js';
import { ReportCaseStatus, ReviewDecision } from '../../src/contexts/reports/domain/entities/ContentReportCase.js';
import { InvalidReportPolicyError, ReportPolicy } from '../../src/contexts/reports/domain/value-objects/ReportPolicy.js';
import { InfractionOutcome } from '../../src/contexts/forum/domain/entities/Infraction.js';
import { SanctionLevel } from '../../src/contexts/forum/domain/entities/Sanction.js';
import { ADMIN, ANA, buildReportsHarness, policyWith, reporter, type ReportsHarness } from './reportsHarness.js';

async function reportBy(h: ReportsHarness, postId: string, n: number, causeId = 'spam') {
  const result = await h.report.execute({ reporterEmail: reporter(n), kind: 'post', contentId: postId, causeId });
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe('HU-34 — reporte de contenido por la comunidad y ocultamiento preventivo (RF-53, RF-54, RNF-18)', () => {
  describe('criterio 1 — reportar con causa y encolar para el administrador', () => {
    it('un reporte con causa entra a la cola del administrador y la publicación sigue visible bajo el umbral', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();

      const result = await reportBy(h, postId, 1, 'harassment');

      expect(result).toMatchObject({ status: 'queued', hiddenPreventively: false });
      const queue = await h.queue.execute();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        caseId: `post:${postId}`,
        contentId: postId,
        reportCount: 1,
        causes: [{ causeId: 'harassment', label: 'Acoso o ataque a otra persona', count: 1 }]
      });
      expect(await h.visiblePostIds()).toContain(postId);
    });

    it('rechaza una causa fuera del catálogo, una causa "otra" sin explicación y detalle demasiado largo', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();

      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'inventada' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.UNKNOWN_CAUSE
      });
      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'other' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.INVALID_REPORT
      });
      expect(
        await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'other', detail: 'x'.repeat(501) })
      ).toMatchObject({ ok: false, error: ReportRejectionKind.INVALID_REPORT });
      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'other', detail: 'Vende cosas ilegales' })).toMatchObject({ ok: true });
      expect(await h.queue.execute()).toHaveLength(1);
    });

    it('rechaza contenido inexistente, propio, un tipo inválido y datos vacíos', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();

      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: 'no-existe', causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.CONTENT_NOT_FOUND
      });
      expect(await h.report.execute({ reporterEmail: ANA.toUpperCase(), kind: 'post', contentId: postId, causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.OWN_CONTENT
      });
      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'video' as 'post', contentId: postId, causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.INVALID_REPORT
      });
      expect(await h.report.execute({ reporterEmail: '  ', kind: 'post', contentId: postId, causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.INVALID_REPORT
      });
      expect(await h.queue.execute()).toHaveLength(0);
    });

    it('un comentario no existe todavía en el foro: se responde no encontrado (diferido)', async () => {
      const h = buildReportsHarness();
      await h.publishPost();
      expect(await h.report.execute({ reporterEmail: reporter(1), kind: 'comment', contentId: 'c-1', causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.CONTENT_NOT_FOUND
      });
    });
  });

  describe('criterio 2 — el reporte queda asociado a contenido, causa y reportante; el autor no lo ve', () => {
    it('la cola del administrador identifica contenido, causa y reportante', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      await reportBy(h, postId, 1, 'offensive-language');

      const stored = await h.cases.findById(`post:${postId}`);
      expect(stored?.reports).toEqual([
        { reporterEmail: reporter(1), causeId: 'offensive-language', detail: null, reportedAt: h.forum.now() }
      ]);
      const [item] = await h.queue.execute();
      expect(item?.reporters).toEqual([reporter(1)]);
    });

    it('el autor solo sabe si su contenido está oculto en revisión; nada de reportantes, causas ni conteo', async () => {
      const h = buildReportsHarness({ policy: policyWith({ hideThreshold: 2 }) });
      const postId = await h.publishPost();
      await reportBy(h, postId, 1, 'harassment');

      const visible = await h.authorStatus.execute({ authorEmail: ANA, kind: 'post', contentId: postId });
      expect(visible).toEqual({ ok: true, status: { contentId: postId, kind: 'post', state: 'visible' } });

      await reportBy(h, postId, 2, 'harassment');
      const hidden = await h.authorStatus.execute({ authorEmail: ANA, kind: 'post', contentId: postId });
      expect(hidden).toEqual({ ok: true, status: { contentId: postId, kind: 'post', state: 'hidden-under-review' } });
      const serialized = JSON.stringify(hidden);
      expect(serialized).not.toContain('reportante');
      expect(serialized).not.toContain('harassment');
    });

    it('la vista pública de la publicación y las cabeceras del autor no exponen reportes', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      await reportBy(h, postId, 1);

      const listed = await h.forum.listPosts.execute({ viewerEmail: ANA, topicId: 'general' });
      expect(JSON.stringify(listed)).not.toContain('reportante');
      expect(await h.authorStatus.execute({ authorEmail: reporter(1), kind: 'post', contentId: postId })).toMatchObject({ ok: false, error: 'not-author' });
      expect(await h.authorStatus.execute({ authorEmail: ANA, kind: 'post', contentId: 'otro' })).toEqual({ ok: true, status: null });
    });
  });

  describe('criterio 3 — un mismo usuario reportando dos veces cuenta como uno', () => {
    it('el segundo reporte del mismo usuario no suma, ni siquiera cambiando de causa o de mayúsculas', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      await reportBy(h, postId, 1, 'spam');
      const again = await h.report.execute({ reporterEmail: reporter(1).toUpperCase(), kind: 'post', contentId: postId, causeId: 'harassment' });

      expect(again).toMatchObject({ ok: true, status: 'duplicate' });
      const [item] = await h.queue.execute();
      expect(item).toMatchObject({ reportCount: 1, causes: [{ causeId: 'spam', count: 1 }] });
    });

    it('por mucho que un usuario repita, no alcanza el umbral', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      for (let i = 0; i < 10; i += 1) await h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'spam' });
      await reportBy(h, postId, 2);

      expect(await h.visiblePostIds()).toContain(postId);
      expect((await h.cases.findById(`post:${postId}`))?.status).toBe(ReportCaseStatus.OPEN);
    });

    it('dos peticiones simultáneas del mismo usuario cuentan una sola vez', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      await Promise.all([
        h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'spam' }),
        h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'spam' })
      ]);
      expect((await h.cases.findById(`post:${postId}`))?.reports).toHaveLength(1);
    });
  });

  describe('criterio 4 — ocultamiento automático al alcanzar el umbral configurable', () => {
    it('con el umbral de config/community-reports.json (3) oculta al tercer reportante distinto y audita al sistema', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();

      expect(await reportBy(h, postId, 1)).toMatchObject({ hiddenPreventively: false });
      expect(await reportBy(h, postId, 2)).toMatchObject({ hiddenPreventively: false });
      expect(await h.visiblePostIds()).toContain(postId);
      expect(await reportBy(h, postId, 3)).toMatchObject({ hiddenPreventively: true });

      expect(await h.visiblePostIds()).not.toContain(postId);
      expect((await h.cases.findById(`post:${postId}`))?.status).toBe(ReportCaseStatus.HIDDEN_PREVENTIVELY);
      expect(h.audit.events).toEqual([
        { kind: 'content-hidden-preventively', caseId: `post:${postId}`, reportCount: 3, performedBy: 'system', occurredAt: h.forum.now() }
      ]);
      expect((await h.queue.execute())[0]).toMatchObject({ status: ReportCaseStatus.HIDDEN_PREVENTIVELY, reportCount: 3 });
    });

    it('el umbral es un dato: con 1 oculta al primer reporte', async () => {
      const h = buildReportsHarness({ policy: policyWith({ hideThreshold: 1 }) });
      const postId = await h.publishPost();
      expect(await reportBy(h, postId, 1)).toMatchObject({ hiddenPreventively: true });
      expect(await h.visiblePostIds()).not.toContain(postId);
    });

    it('rechaza reportar un contenido ya oculto, y ese intento vuelve a ocultarlo (fail-safe)', async () => {
      const h = buildReportsHarness({ policy: policyWith({ hideThreshold: 1 }) });
      const postId = await h.publishPost();
      await reportBy(h, postId, 1);
      // Simula que otra vía lo volvió a mostrar sin pasar por el administrador.
      await h.forum.posts.setHidden(postId, null);
      expect(await h.visiblePostIds()).toContain(postId);

      expect(await h.report.execute({ reporterEmail: reporter(2), kind: 'post', contentId: postId, causeId: 'spam' })).toMatchObject({
        ok: false,
        error: ReportRejectionKind.CONTENT_NOT_VISIBLE
      });
      expect(await h.visiblePostIds()).not.toContain(postId);
    });

    it('fail-safe: si el foro falla al ocultar, el caso ya quedó oculto y el siguiente reporte converge a oculto', async () => {
      let failing = true;
      const h = buildReportsHarness({
        policy: policyWith({ hideThreshold: 1 }),
        contents: (base) => ({
          find: (kind, id) => base.find(kind, id),
          setHidden: async (kind, id, hidden) => {
            if (failing && hidden) throw new Error('foro caído');
            await base.setHidden(kind, id, hidden);
          }
        })
      });
      const postId = await h.publishPost();

      await expect(h.report.execute({ reporterEmail: reporter(1), kind: 'post', contentId: postId, causeId: 'spam' })).rejects.toThrow('foro caído');
      expect((await h.cases.findById(`post:${postId}`))?.status).toBe(ReportCaseStatus.HIDDEN_PREVENTIVELY);
      expect(await h.visiblePostIds()).toContain(postId);

      failing = false;
      await h.report.execute({ reporterEmail: reporter(2), kind: 'post', contentId: postId, causeId: 'spam' });
      expect(await h.visiblePostIds()).not.toContain(postId);
    });

    it('rechaza una política inválida (umbral no positivo, sin causas, causas repetidas)', () => {
      const base = { hideThreshold: 3, causes: [{ id: 'a', label: 'A' }], abuse: { unfoundedReportsThreshold: 3, windowDays: 90 } };
      expect(() => ReportPolicy.of({ ...base, hideThreshold: 0 })).toThrow(InvalidReportPolicyError);
      expect(() => ReportPolicy.of({ ...base, causes: [] })).toThrow(InvalidReportPolicyError);
      expect(() => ReportPolicy.of({ ...base, causes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })).toThrow(InvalidReportPolicyError);
      expect(() => ReportPolicy.of({ ...base, abuse: { unfoundedReportsThreshold: 1.5, windowDays: 90 } })).toThrow(InvalidReportPolicyError);
      expect(ReportPolicy.of(base).causeLabel('desconocida')).toBe('desconocida');
    });
  });

  describe('criterio 5 — restaurar o confirmar la infracción, con decisión auditada', () => {
    async function hiddenPost(h: ReportsHarness): Promise<string> {
      const postId = await h.publishPost();
      for (const n of [1, 2, 3]) await reportBy(h, postId, n);
      return postId;
    }

    it('restaurar vuelve a mostrar el contenido, reinicia el contador y audita al administrador con su motivo', async () => {
      const h = buildReportsHarness();
      const postId = await hiddenPost(h);

      const result = await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: 'No infringe las normas', performedBy: ADMIN });

      expect(result).toMatchObject({ ok: true, decision: ReviewDecision.RESTORE, sanctionLevel: null });
      expect(await h.visiblePostIds()).toContain(postId);
      const restored = await h.cases.findById(`post:${postId}`);
      expect(restored).toMatchObject({ status: ReportCaseStatus.OPEN, reports: [], hiddenAt: null });
      expect(restored?.history).toHaveLength(1);
      expect(h.audit.events).toContainEqual({
        kind: 'report-review-decided',
        caseId: `post:${postId}`,
        decision: ReviewDecision.RESTORE,
        reason: 'No infringe las normas',
        performedBy: ADMIN,
        occurredAt: h.forum.now()
      });
      expect(await h.queue.execute()).toHaveLength(0);
    });

    it('tras restaurar, hacen falta reportes nuevos para ocultar otra vez (el mismo reportante puede volver a reportar)', async () => {
      const h = buildReportsHarness();
      const postId = await hiddenPost(h);
      await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: 'Falsa alarma', performedBy: ADMIN });

      expect(await reportBy(h, postId, 1)).toMatchObject({ status: 'queued', hiddenPreventively: false });
      expect(await h.visiblePostIds()).toContain(postId);
    });

    it('confirmar mantiene el contenido oculto y registra la infracción en el historial de HU-35 (sin duplicarlo)', async () => {
      const h = buildReportsHarness();
      const postId = await hiddenPost(h);

      const result = await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: 'Acoso confirmado', performedBy: ADMIN });

      expect(result).toMatchObject({ ok: true, sanctionLevel: SanctionLevel.WARNING });
      expect(await h.visiblePostIds()).not.toContain(postId);
      expect((await h.cases.findById(`post:${postId}`))?.status).toBe(ReportCaseStatus.INFRACTION_CONFIRMED);
      const infractions = await h.forum.infractions.findByStudent(ANA);
      expect(infractions).toHaveLength(1);
      expect(infractions[0]).toMatchObject({
        id: `post:${postId}`,
        outcome: InfractionOutcome.BLOCKED,
        reason: 'Acoso confirmado',
        detectedBy: 'community-reports',
        content: { kind: 'post', id: postId, topicId: 'general' }
      });
      expect(h.audit.events.filter((e) => e.kind === 'report-review-decided')).toHaveLength(1);
      expect(await h.authorStatus.execute({ authorEmail: ANA, kind: 'post', contentId: postId })).toMatchObject({ ok: true, status: { state: 'removed' } });
    });

    it('la confirmación escala con las sanciones graduales de HU-35 (3.ª infracción confirmada suspende)', async () => {
      const h = buildReportsHarness({ policy: policyWith({ hideThreshold: 1 }) });
      let last;
      for (let n = 1; n <= 3; n += 1) {
        const postId = await h.publishPost(n);
        await reportBy(h, postId, n);
        last = await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: `Infracción ${n}`, performedBy: ADMIN });
        h.forum.advanceHours(1);
      }
      expect(last).toMatchObject({ ok: true, sanctionLevel: SanctionLevel.TEMPORARY_SUSPENSION });
    });

    it('confirmar promueve a bloqueada una infracción que la moderación automática había retenido', async () => {
      const h = buildReportsHarness({ policy: policyWith({ hideThreshold: 1 }) });
      const postId = await h.publishPost();
      await h.forum.recordInfraction.execute({
        studentEmail: ANA,
        content: { kind: 'post', id: postId, topicId: 'general', title: 'Título 1', text: 'Texto 1' },
        outcome: InfractionOutcome.RETAINED,
        reason: 'Dudoso',
        detectedBy: 'automatic-moderation'
      });
      await reportBy(h, postId, 1);

      await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: 'Confirmado', performedBy: ADMIN });
      expect((await h.forum.infractions.findByStudent(ANA)).map((i) => i.outcome)).toEqual([InfractionOutcome.BLOCKED]);
    });

    it('un administrador puede resolver un caso con reportes pendientes aunque no haya llegado al umbral', async () => {
      const h = buildReportsHarness();
      const postId = await h.publishPost();
      await reportBy(h, postId, 1);
      expect(await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: 'Evidente', performedBy: ADMIN })).toMatchObject({ ok: true });
      expect(await h.visiblePostIds()).not.toContain(postId);
    });

    it('exige motivo, decisión válida, caso existente con pendientes y no admite decidir dos veces una confirmación', async () => {
      const h = buildReportsHarness();
      const postId = await hiddenPost(h);

      expect(await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: '  ', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: ReportReviewFailureKind.REASON_REQUIRED
      });
      expect(await h.review.execute({ kind: 'post', contentId: postId, decision: 'borrar' as ReviewDecision, reason: 'x', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: ReportReviewFailureKind.INVALID_DECISION
      });
      expect(await h.review.execute({ kind: 'post', contentId: 'nada', decision: ReviewDecision.RESTORE, reason: 'x', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: ReportReviewFailureKind.CASE_NOT_FOUND
      });
      expect(h.audit.events.filter((e) => e.kind === 'report-review-decided')).toHaveLength(0);

      await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: 'x', performedBy: ADMIN });
      expect(await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: 'x', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: ReportReviewFailureKind.NOTHING_TO_REVIEW
      });

      const other = await h.publishPost(2);
      await reportBy(h, other, 1);
      await h.review.execute({ kind: 'post', contentId: other, decision: ReviewDecision.CONFIRM_INFRACTION, reason: 'ok', performedBy: ADMIN });
      expect(await h.review.execute({ kind: 'post', contentId: other, decision: ReviewDecision.RESTORE, reason: 'ok', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: ReportReviewFailureKind.ALREADY_CONFIRMED
      });
    });

    it('si HU-35 rechaza la infracción, no se confirma: el contenido sigue oculto en revisión', async () => {
      const h = buildReportsHarness();
      const postId = await hiddenPost(h);
      const overlong = 'r'.repeat(501);

      const result = await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: overlong, performedBy: ADMIN });

      expect(result).toMatchObject({ ok: false, error: ReportReviewFailureKind.INFRACTION_REJECTED });
      expect((await h.cases.findById(`post:${postId}`))?.status).toBe(ReportCaseStatus.HIDDEN_PREVENTIVELY);
      expect(await h.visiblePostIds()).not.toContain(postId);
    });

    it('la cola ordena primero lo oculto, luego por más reportes y por antigüedad', async () => {
      const h = buildReportsHarness();
      const a = await h.publishPost(1);
      const b = await h.publishPost(2);
      const c = await h.publishPost(3);
      await reportBy(h, a, 1);
      h.forum.advanceHours(1);
      await reportBy(h, b, 1);
      await reportBy(h, b, 2);
      h.forum.advanceHours(1);
      for (const n of [1, 2, 3]) await reportBy(h, c, n);

      expect((await h.queue.execute()).map((item) => item.contentId)).toEqual([c, b, a]);
    });
  });

  describe('criterio 6 — patrón de reportes infundados registrado para el administrador', () => {
    async function unfoundedRound(h: ReportsHarness, n: number, reporters: readonly number[]) {
      const postId = await h.publishPost(n);
      for (const r of reporters) await reportBy(h, postId, r);
      const result = await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.RESTORE, reason: `Infundado ${n}`, performedBy: ADMIN });
      h.forum.advanceHours(1);
      return result;
    }

    it('al acumular el umbral de reportes infundados la cuenta queda marcada y auditada; los demás reportantes no', async () => {
      const h = buildReportsHarness();
      const results = [];
      for (let n = 1; n <= 3; n += 1) results.push(await unfoundedRound(h, n, n === 3 ? [9, 8] : [9]));

      expect(results.map((r) => (r.ok ? r.abuseFlagged : null))).toEqual([[], [], [reporter(9)]]);
      const flags = await h.abuseList.execute();
      expect(flags).toHaveLength(1);
      expect(flags[0]).toMatchObject({ reporterEmail: reporter(9), unfoundedCount: 3, windowDays: 90, status: 'open' });
      expect(flags[0]?.caseIds).toHaveLength(3);
      expect(h.audit.events.filter((e) => e.kind === 'report-abuse-flagged')).toMatchObject([{ reporterEmail: reporter(9), unfoundedCount: 3, performedBy: 'system' }]);
    });

    it('un cuarto reporte infundado actualiza la misma marca en vez de duplicarla', async () => {
      const h = buildReportsHarness();
      for (let n = 1; n <= 4; n += 1) await unfoundedRound(h, n, [9]);
      const flags = await h.abuseList.execute();
      expect(flags).toHaveLength(1);
      expect(flags[0]?.unfoundedCount).toBe(4);
    });

    it('los reportes confirmados no cuentan como infundados', async () => {
      const h = buildReportsHarness();
      for (let n = 1; n <= 3; n += 1) {
        const postId = await h.publishPost(n);
        await reportBy(h, postId, 9);
        await h.review.execute({ kind: 'post', contentId: postId, decision: ReviewDecision.CONFIRM_INFRACTION, reason: 'Sí infringe', performedBy: ADMIN });
        h.forum.advanceHours(1);
      }
      expect(await h.abuseList.execute()).toHaveLength(0);
    });

    it('los infundados fuera de la ventana configurada no cuentan', async () => {
      const h = buildReportsHarness({ policy: policyWith({ abuse: { windowDays: 10 } }) });
      await unfoundedRound(h, 1, [9]);
      await unfoundedRound(h, 2, [9]);
      h.forum.advanceHours(24 * 11);
      await unfoundedRound(h, 3, [9]);
      expect(await h.abuseList.execute()).toHaveLength(0);
    });

    it('lista primero a la cuenta con más infundados', async () => {
      const h = buildReportsHarness({ policy: policyWith({ abuse: { unfoundedReportsThreshold: 1 } }) });
      await unfoundedRound(h, 1, [7]);
      await unfoundedRound(h, 2, [8]);
      await unfoundedRound(h, 3, [8]);
      expect((await h.abuseList.execute()).map((flag) => flag.reporterEmail)).toEqual([reporter(8), reporter(7)]);
    });
  });
});
