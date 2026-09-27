import { describe, expect, it } from 'vitest';
import { PostRejectionKind } from '../../src/contexts/forum/application/CreatePost.js';
import { InfractionRejectionKind, type RecordInfractionInput } from '../../src/contexts/forum/application/RecordInfraction.js';
import { SanctionRevocationFailureKind } from '../../src/contexts/forum/application/RevokeSanction.js';
import { InfractionOutcome } from '../../src/contexts/forum/domain/entities/Infraction.js';
import { SanctionLevel } from '../../src/contexts/forum/domain/entities/Sanction.js';
import { buildForumHarness } from './forumHarness.js';

const ADMIN = 'admin-foro@upb.edu.co';
const ANA = 'ana@upb.edu.co';
const body = { title: 'Hola', text: 'Una publicación cualquiera.' };

type Forum = ReturnType<typeof buildForumHarness>;

async function withSeededForum(): Promise<Forum> {
  const forum = buildForumHarness();
  await forum.seed.execute(forum.seedTopics);
  await forum.login('ana');
  return forum;
}

const infractionInput = (n: number, overrides: Partial<RecordInfractionInput> = {}): RecordInfractionInput => ({
  studentEmail: ANA,
  content: { kind: 'post', id: `p-${n}`, topicId: 'general', title: `Publicación ${n}`, text: `Contenido ofensivo ${n}` },
  outcome: InfractionOutcome.BLOCKED,
  reason: 'Lenguaje ofensivo contra otro estudiante',
  detectedBy: 'automatic-moderation',
  ...overrides
});

/** Bloquea `count` contenidos seguidos, una hora entre cada uno. Devuelve el último resultado. */
async function block(forum: Forum, from: number, count: number) {
  let last;
  for (let n = from; n < from + count; n += 1) {
    last = await forum.recordInfraction.execute(infractionInput(n));
    forum.advanceHours(1);
  }
  if (!last?.ok) throw new Error('infracción rechazada');
  return last;
}

const publish = (forum: Forum) => forum.createPost.execute({ authorEmail: ANA, topicId: 'general', body });

describe('HU-35 — sanciones graduales e historial de moderación (RF-55, RF-56, RNF-18, RNF-33; CU-03 flujo alternativo C, E2)', () => {
  describe('criterio 1 — sanción automática al alcanzar cada umbral', () => {
    it('advierte en la 1.ª infracción, suspende 7 días en la 3.ª y 30 en la 5.ª, sin sanción en la 2.ª ni la 4.ª', async () => {
      const forum = await withSeededForum();
      const levels: (SanctionLevel | null)[] = [];
      for (let n = 1; n <= 5; n += 1) {
        const result = await forum.recordInfraction.execute(infractionInput(n));
        if (!result.ok) throw new Error(result.message);
        levels.push(result.sanction?.level ?? null);
        forum.advanceHours(1);
      }

      expect(levels).toEqual([
        SanctionLevel.WARNING,
        null,
        SanctionLevel.TEMPORARY_SUSPENSION,
        null,
        SanctionLevel.EXTENDED_SUSPENSION
      ]);
      const stored = await forum.sanctions.findSanctions(ANA);
      expect(stored.map((s) => [s.level, s.infractionCount, s.triggeredByInfractionId])).toEqual([
        [SanctionLevel.EXTENDED_SUSPENSION, 5, 'post:p-5'],
        [SanctionLevel.TEMPORARY_SUSPENSION, 3, 'post:p-3'],
        [SanctionLevel.WARNING, 1, 'post:p-1']
      ]);
      expect(forum.sanctionAudit.events.filter((e) => e.kind === 'sanction-imposed')).toHaveLength(3);
    });

    it('un contenido retenido no sanciona; al bloquearse sí, y cuenta una sola vez', async () => {
      const forum = await withSeededForum();

      const retained = await forum.recordInfraction.execute(infractionInput(1, { outcome: InfractionOutcome.RETAINED }));
      expect(retained).toMatchObject({ ok: true, status: 'created', sanction: null });

      const blocked = await forum.recordInfraction.execute(infractionInput(1, { reason: 'Confirmado: acoso' }));
      expect(blocked).toMatchObject({ ok: true, status: 'escalated', infraction: { outcome: InfractionOutcome.BLOCKED, reason: 'Confirmado: acoso' } });
      if (!blocked.ok) throw new Error(blocked.message);
      expect(blocked.sanction?.level).toBe(SanctionLevel.WARNING);

      const retry = await forum.recordInfraction.execute(infractionInput(1));
      expect(retry).toMatchObject({ ok: true, status: 'unchanged', sanction: null });
      const downgrade = await forum.recordInfraction.execute(infractionInput(1, { outcome: InfractionOutcome.RETAINED }));
      expect(downgrade).toMatchObject({ ok: true, status: 'unchanged', infraction: { outcome: InfractionOutcome.BLOCKED } });
      expect(await forum.infractions.findByStudent(ANA)).toHaveLength(1);
    });

    it('rechaza sin guardar una infracción sin motivo o sin contenido, y un contenido registrado a nombre de otro', async () => {
      const forum = await withSeededForum();

      for (const invalid of [
        infractionInput(1, { reason: '  ' }),
        infractionInput(1, { detectedBy: '' }),
        infractionInput(1, { studentEmail: ' ' }),
        infractionInput(1, { content: { kind: 'post', id: '', topicId: 'general', title: null, text: 'x' } }),
        infractionInput(1, { content: { kind: 'post', id: 'p-1', topicId: 'general', title: null, text: ' ' } }),
        infractionInput(1, { content: { kind: 'post', id: 'p-1', topicId: 'general', title: null, text: 'x'.repeat(5001) } }),
        infractionInput(1, { reason: 'x'.repeat(501) }),
        infractionInput(1, { outcome: 'deleted' as InfractionOutcome }),
        infractionInput(1, { content: { kind: 'story' as 'post', id: 'p-1', topicId: 'general', title: null, text: 'x' } })
      ]) {
        expect(await forum.recordInfraction.execute(invalid)).toMatchObject({ ok: false, error: InfractionRejectionKind.INVALID_INFRACTION });
      }
      expect(await forum.infractions.findByStudent(ANA)).toHaveLength(0);

      await forum.recordInfraction.execute(infractionInput(1));
      expect(await forum.recordInfraction.execute(infractionInput(1, { studentEmail: 'luis@upb.edu.co' }))).toMatchObject({
        ok: false,
        error: InfractionRejectionKind.CONTENT_OWNER_MISMATCH
      });
    });

    it('el correo del autor se normaliza: la misma persona acumula en un solo historial', async () => {
      const forum = await withSeededForum();
      await forum.recordInfraction.execute(infractionInput(1, { studentEmail: '  ANA@upb.edu.co' }));

      expect(await forum.infractions.findByStudent(ANA)).toHaveLength(1);
    });
  });

  describe('criterio 2 — el administrador es notificado y el estudiante recibe motivo y duración', () => {
    it('una suspensión avisa al estudiante con el motivo, la duración y la fecha de fin, y a los administradores', async () => {
      const forum = await withSeededForum();
      const result = await block(forum, 1, 3);

      const sanctionId = result.sanction!.id;
      const toStudent = forum.notifications.toStudents.find((n) => n.sanctionId === sanctionId);
      expect(toStudent).toMatchObject({
        kind: 'sanction-imposed',
        studentEmail: ANA,
        level: SanctionLevel.TEMPORARY_SUSPENSION,
        durationText: '7 días',
        reason: expect.stringContaining('Lenguaje ofensivo contra otro estudiante')
      });
      expect(toStudent?.message).toContain('por 7 días, hasta el 29 de septiembre de 2026');
      expect(toStudent?.message).toContain('Motivo: Suspensión temporal de la facultad de publicar por 3 infracciones');
      expect(forum.notifications.toAdministrators.find((n) => n.sanctionId === sanctionId)).toEqual(toStudent);
    });

    it('una advertencia avisa sin duración: no suspende', async () => {
      const forum = await withSeededForum();
      await forum.recordInfraction.execute(infractionInput(1));

      expect(forum.notifications.toStudents[0]).toMatchObject({ level: SanctionLevel.WARNING, durationText: null });
      expect(forum.notifications.toStudents[0]?.message).toContain('aún puedes publicar');
      expect(forum.notifications.toAdministrators).toHaveLength(1);
    });

    it('sin cambio de escalón no se avisa a nadie', async () => {
      const forum = await withSeededForum();
      await block(forum, 1, 2);

      expect(forum.notifications.toStudents).toHaveLength(1);
      expect(forum.notifications.toAdministrators).toHaveLength(1);
    });
  });

  describe('criterio 3 — con sanción activa, el servidor rechaza publicar e informa la fecha de fin', () => {
    it('la suspensión impuesta por historial rechaza la publicación con la fecha de fin', async () => {
      const forum = await withSeededForum();
      const { sanction } = await block(forum, 1, 3);

      const result = await publish(forum);

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.SANCTIONED, sanctionEndsAt: sanction!.endsAt });
      if (result.ok) throw new Error('debía rechazarse');
      expect(result.message).toContain('Tienes una sanción activa en el foro hasta el 29 de septiembre de 2026');
    });

    it('una advertencia no impide publicar', async () => {
      const forum = await withSeededForum();
      await forum.recordInfraction.execute(infractionInput(1));

      expect((await publish(forum)).ok).toBe(true);
    });
  });

  describe('criterio 4 — al vencer el plazo, la facultad de publicar se restablece sola', () => {
    it('sin ninguna operación intermedia, publicar vuelve a funcionar al cumplirse la suspensión', async () => {
      const forum = await withSeededForum();
      const { sanction } = await block(forum, 1, 3);

      forum.advanceHours((sanction!.endsAt.getTime() - forum.now().getTime()) / 3_600_000 - 1);
      expect((await publish(forum)).ok).toBe(false);
      forum.advanceHours(1);
      expect((await publish(forum)).ok).toBe(true);
    });
  });

  describe('criterio 5 — historial completo por usuario', () => {
    it('muestra contenidos retenidos y bloqueados y las sanciones con fecha, motivo y estado', async () => {
      const forum = await withSeededForum();
      await block(forum, 1, 3);
      await forum.recordInfraction.execute(
        infractionInput(9, {
          outcome: InfractionOutcome.RETAINED,
          content: { kind: 'comment', id: 'c-9', topicId: 'compraventa', title: null, text: 'Comentario dudoso' },
          detectedBy: 'community-reports'
        })
      );

      const history = await forum.history.execute({ studentEmail: 'ANA@upb.edu.co' });

      expect(history.studentEmail).toBe(ANA);
      expect(history.contents.map((c) => [c.id, c.outcome, c.computable])).toEqual([
        ['comment:c-9', InfractionOutcome.RETAINED, false],
        ['post:p-3', InfractionOutcome.BLOCKED, true],
        ['post:p-2', InfractionOutcome.BLOCKED, true],
        ['post:p-1', InfractionOutcome.BLOCKED, true]
      ]);
      expect(history.contents[0]).toMatchObject({
        content: { kind: 'comment', text: 'Comentario dudoso', topicId: 'compraventa' },
        reason: 'Lenguaje ofensivo contra otro estudiante',
        detectedBy: 'community-reports',
        occurredAt: expect.any(Date)
      });
      expect(history.sanctions.map((s) => [s.level, s.status])).toEqual([
        [SanctionLevel.TEMPORARY_SUSPENSION, 'active'],
        [SanctionLevel.WARNING, 'warning']
      ]);
      expect(history.sanctions[0]).toMatchObject({ reason: expect.stringContaining('3 infracciones'), imposedAt: expect.any(Date) });
      expect(history).toMatchObject({
        computableInfractions: 3,
        standing: SanctionLevel.TEMPORARY_SUSPENSION,
        suspendedUntil: history.sanctions[0]!.endsAt
      });
    });

    it('un estudiante sin historial devuelve un historial vacío, no un error', async () => {
      const forum = await withSeededForum();

      expect(await forum.history.execute({ studentEmail: 'luis@upb.edu.co' })).toEqual({
        studentEmail: 'luis@upb.edu.co',
        contents: [],
        sanctions: [],
        computableInfractions: 0,
        standing: 'none',
        suspendedUntil: null
      });
    });

    it('una sanción cumplida aparece como cumplida, no activa', async () => {
      const forum = await withSeededForum();
      await block(forum, 1, 3);
      forum.advanceHours(24 * 8);

      const history = await forum.history.execute({ studentEmail: ANA });
      expect(history.sanctions[0]?.status).toBe('served');
      expect(history.suspendedUntil).toBeNull();
    });
  });

  describe('criterio 6 — revocar una sanción improcedente queda auditado con el administrador', () => {
    it('revoca, permite publicar de inmediato, audita al administrador y avisa al estudiante', async () => {
      const forum = await withSeededForum();
      const { sanction } = await block(forum, 1, 3);

      const result = await forum.revokeSanction.execute({ sanctionId: sanction!.id, reason: '  La moderación confundió el contexto  ', performedBy: ADMIN });

      expect(result).toMatchObject({
        ok: true,
        sanction: { revocation: { revokedBy: ADMIN, reason: 'La moderación confundió el contexto', revokedAt: forum.now() } }
      });
      expect(forum.sanctionAudit.events.at(-1)).toEqual({
        kind: 'sanction-revoked',
        sanctionId: sanction!.id,
        studentEmail: ANA,
        reason: 'La moderación confundió el contexto',
        performedBy: ADMIN,
        occurredAt: forum.now()
      });
      expect(forum.notifications.toStudents.at(-1)).toMatchObject({ kind: 'sanction-revoked', sanctionId: sanction!.id });
      expect((await publish(forum)).ok).toBe(true);

      const history = await forum.history.execute({ studentEmail: ANA });
      expect(history.sanctions[0]).toMatchObject({ status: 'revoked', revocation: { revokedBy: ADMIN } });
      // La infracción que la disparó deja de computar: la siguiente vuelve a ser la tercera.
      expect(history.contents.find((c) => c.id === 'post:p-3')?.computable).toBe(false);
      const next = await forum.recordInfraction.execute(infractionInput(4));
      expect(next.ok && next.sanction?.level).toBe(SanctionLevel.TEMPORARY_SUSPENSION);
    });

    it('exige motivo, rechaza una sanción inexistente y una ya revocada', async () => {
      const forum = await withSeededForum();
      const { sanction } = await block(forum, 1, 3);

      expect(await forum.revokeSanction.execute({ sanctionId: sanction!.id, reason: ' ', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: SanctionRevocationFailureKind.REASON_REQUIRED
      });
      expect(await forum.revokeSanction.execute({ sanctionId: 'no-existe', reason: 'x', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: SanctionRevocationFailureKind.SANCTION_NOT_FOUND
      });
      await forum.revokeSanction.execute({ sanctionId: sanction!.id, reason: 'x', performedBy: ADMIN });
      expect(await forum.revokeSanction.execute({ sanctionId: sanction!.id, reason: 'otra vez', performedBy: 'otro@upb.edu.co' })).toMatchObject({
        ok: false,
        error: SanctionRevocationFailureKind.ALREADY_REVOKED
      });
      expect(forum.sanctionAudit.events.filter((e) => e.kind === 'sanction-revoked')).toHaveLength(1);
    });
  });

  describe('criterio 7 — el administrador ajusta los umbrales sin desarrollo', () => {
    it('el ajuste aplica desde la siguiente infracción y queda auditado', async () => {
      const forum = await withSeededForum();
      expect(await forum.manageThresholds.get()).toMatchObject({ updatedBy: null, thresholds: { values: { temporarySuspensionAt: 3 } } });

      const updated = await forum.manageThresholds.update({ values: { temporarySuspensionAt: 2, temporarySuspensionDays: 3 }, performedBy: ADMIN });
      expect(updated).toMatchObject({ ok: true, thresholds: { warningAt: 1, temporarySuspensionAt: 2, temporarySuspensionDays: 3 } });

      const { sanction } = await block(forum, 1, 2);
      expect(sanction).toMatchObject({ level: SanctionLevel.TEMPORARY_SUSPENSION, infractionCount: 2 });
      expect(forum.notifications.toStudents.at(-1)).toMatchObject({ durationText: '3 días' });
      expect(await forum.manageThresholds.get()).toMatchObject({ updatedBy: ADMIN, updatedAt: expect.any(Date) });
      expect(forum.sanctionAudit.events.find((e) => e.kind === 'thresholds-changed')).toMatchObject({
        performedBy: ADMIN,
        previous: { temporarySuspensionAt: 3, temporarySuspensionDays: 7 },
        next: { temporarySuspensionAt: 2, temporarySuspensionDays: 3 }
      });
    });

    it('rechaza umbrales incoherentes sin cambiar nada', async () => {
      const forum = await withSeededForum();

      const result = await forum.manageThresholds.update({ values: { warningAt: 4 }, performedBy: ADMIN });

      expect(result).toMatchObject({ ok: false, error: 'invalid-thresholds', message: expect.stringContaining('los niveles deben crecer') });
      expect((await forum.manageThresholds.get()).updatedBy).toBeNull();
      expect(forum.sanctionAudit.events).toHaveLength(0);
    });

    it('no reevalúa sanciones ya impuestas', async () => {
      const forum = await withSeededForum();
      const { sanction } = await block(forum, 1, 3);

      await forum.manageThresholds.update({ values: { temporarySuspensionDays: 1, extendedSuspensionDays: 2 }, performedBy: ADMIN });

      expect(await forum.sanctions.findById(sanction!.id)).toEqual(sanction);
    });
  });
});
