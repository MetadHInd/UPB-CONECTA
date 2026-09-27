import { describe, expect, it } from 'vitest';
import { RectificationFailureKind } from '../../src/contexts/datarights/application/RectifyPersonalData.js';
import { PERSONAL_DATA_AREAS } from '../../src/contexts/datarights/domain/entities/PersonalDataArea.js';
import { ANA, buildDataRightsHarness, LUIS } from './dataRightsHarness.js';

const DAY = 86_400_000;

describe('HU-48 — ejercicio de derechos del titular y política de retención (RNF-20/22/24, Ley 1581 de 2012)', () => {
  describe('criterio 1 — consultar qué datos conserva el sistema', () => {
    it('lista perfil, preferencias, publicaciones, seguimiento y dispositivos del estudiante autenticado', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      const report = await rights.report.execute({ subject: ANA });

      expect(report.areas.map((a) => a.area)).toEqual(expect.arrayContaining([...PERSONAL_DATA_AREAS]));
      const byArea = Object.fromEntries(report.areas.map((a) => [a.area, a.records]));
      expect(byArea['profile']).toEqual([expect.objectContaining({ email: ANA, programId: 'sistemas', semester: 5 })]);
      expect(byArea['preferences']).toEqual([expect.objectContaining({ leadTimeMinutes: 180, theme: 'dark', disabledCategories: 'beca' })]);
      expect(byArea['publications']).toEqual([
        expect.objectContaining({ kind: 'author-signature', name: 'Ana Gómez' }),
        expect.objectContaining({ kind: 'post', title: 'Hola', text: 'Mi primera publicación.' })
      ]);
      expect(byArea['applicationTracking']).toHaveLength(2);
      expect(report.generatedAt).toEqual(rights.now());
    });

    it('solo incluye datos del sujeto de la sesión, nunca los de otro estudiante', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.populate(LUIS);

      const report = await rights.report.execute({ subject: ` ${ANA.toUpperCase()} ` });

      expect(report.subject).toBe(ANA);
      expect(JSON.stringify(report.areas)).not.toContain(LUIS);
      expect(report.areas.find((a) => a.area === 'applicationTracking')?.records).toHaveLength(2);
    });

    it('muestra solo el final del token del dispositivo (RNF-20)', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      const report = await rights.report.execute({ subject: ANA });

      const devices = report.areas.find((a) => a.area === 'devices')?.records ?? [];
      expect(devices).toEqual([expect.objectContaining({ tokenEnding: '123456', status: 'active' })]);
      expect(JSON.stringify(devices)).not.toContain('token-abcdef');
    });

    it('un estudiante sin datos recibe todas las áreas vacías, y lo que se conserva por ley', async () => {
      const rights = buildDataRightsHarness();

      const report = await rights.report.execute({ subject: ANA });

      expect(report.areas.every((a) => a.records.length === 0)).toBe(true);
      expect(report.retained.map((r) => r.area)).toEqual(['consentimiento', 'moderacion']);
    });
  });

  describe('criterio 2 — rectificar un dato rectificable, con fecha', () => {
    it('aplica el semestre corregido y lo registra con fecha, valor anterior y nuevo', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      rights.advanceDays(1);

      const result = await rights.rectify.execute({ subject: ANA, changes: { semester: 7 } });

      expect(result).toEqual({
        ok: true,
        rectifiedAt: rights.now(),
        changes: [{ field: 'semester', previousValue: 5, newValue: 7 }]
      });
      expect((await rights.profiles.findByEmail(ANA))?.semester?.value).toBe(7);
      expect(await rights.rectifications.findBySubject(ANA)).toEqual([
        { subject: ANA, field: 'semester', previousValue: 5, newValue: 7, rectifiedAt: rights.now() }
      ]);
    });

    it('la consulta muestra las correcciones hechas, más reciente primero', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.rectify.execute({ subject: ANA, changes: { semester: 6 } });
      rights.advanceDays(2);
      await rights.rectify.execute({ subject: ANA, changes: { semester: 8 } });

      const report = await rights.report.execute({ subject: ANA });

      expect(report.rectifications.map((r) => r.newValue)).toEqual([8, 6]);
    });

    it('un valor inválido se rechaza y no deja registro', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      const result = await rights.rectify.execute({ subject: ANA, changes: { semester: 99 } });

      expect(result).toMatchObject({ ok: false, error: RectificationFailureKind.REJECTED });
      expect(await rights.rectifications.findBySubject(ANA)).toEqual([]);
      expect((await rights.profiles.findByEmail(ANA))?.semester?.value).toBe(5);
    });

    it('un campo desconocido se rechaza', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      const result = await rights.rectify.execute({ subject: ANA, changes: { favoriteColor: 'azul' } });

      expect(result).toMatchObject({ ok: false, error: RectificationFailureKind.REJECTED, fields: ['favoriteColor'] });
    });
  });

  describe('criterio 3 — un dato del directorio no se edita: se indica el canal institucional', () => {
    it.each(['name', 'email', 'program', 'studentId'])('rechaza %s con el canal de la política y no cambia nada', async (field) => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      const before = await rights.profiles.findByEmail(ANA);

      const result = await rights.rectify.execute({ subject: ANA, changes: { [field]: 'otro valor' } });

      expect(result).toEqual({
        ok: false,
        error: RectificationFailureKind.DIRECTORY_PROVIDED,
        message: rights.policy.directoryCorrectionChannel.instructions,
        fields: [field],
        channel: rights.policy.directoryCorrectionChannel
      });
      expect(await rights.profiles.findByEmail(ANA)).toEqual(before);
      expect(await rights.rectifications.findBySubject(ANA)).toEqual([]);
    });

    it('una petición mixta se rechaza completa: no aplica "lo que sí se podía"', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      const result = await rights.rectify.execute({ subject: ANA, changes: { semester: 9, program: 'medicina' } });

      expect(result).toMatchObject({ ok: false, error: RectificationFailureKind.DIRECTORY_PROVIDED, fields: ['program'] });
      expect((await rights.profiles.findByEmail(ANA))?.semester?.value).toBe(5);
    });
  });

  describe('criterio 4 — la supresión elimina los datos dentro del plazo de la política', () => {
    it('elimina perfil, preferencias, seguimiento, publicaciones, firma y dispositivos del titular', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.rectify.execute({ subject: ANA, changes: { semester: 6 } });

      const confirmation = await rights.erase.execute({ subject: ANA });

      expect(confirmation.status).toBe('completed');
      const after = await rights.report.execute({ subject: ANA });
      expect(after.areas.every((a) => a.records.length === 0)).toBe(true);
      expect(after.rectifications).toEqual([]);
      expect(await rights.forum.posts.findByTopic('general')).toEqual([]);
      expect(await rights.forum.authors.findByEmail(ANA)).toBeNull();
    });

    it('no toca los datos de otros estudiantes', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.populate(LUIS);

      await rights.erase.execute({ subject: ANA });

      const luis = await rights.report.execute({ subject: LUIS });
      expect(luis.areas.every((a) => a.records.length > 0)).toBe(true);
    });

    it('la fecha límite sale de la política en config, no de una constante', async () => {
      const rights = buildDataRightsHarness({ flaky: 'devices' });
      await rights.populate(ANA);

      const pending = await rights.erase.execute({ subject: ANA });

      expect(pending.status).toBe('pending');
      if (pending.status !== 'pending') return;
      expect(pending.dueBy.getTime() - pending.requestedAt.getTime()).toBe(rights.policy.erasureDeadlineDays * DAY);
    });

    it('si un contexto falla la solicitud queda pendiente y el reintento la cumple sin duplicar la solicitud', async () => {
      const rights = buildDataRightsHarness({ flaky: 'devices' });
      await rights.populate(ANA);

      const first = await rights.erase.execute({ subject: ANA });
      const again = await rights.erase.execute({ subject: ANA });
      expect(first.status).toBe('pending');
      expect(again.requestId).toBe(first.requestId);
      expect(rights.requests.all()).toHaveLength(1);
      expect(rights.requests.all()[0]?.attempts).toBe(2);

      rights.flaky!.failing = false;
      rights.advanceDays(1);
      const summary = await rights.processPending.execute();

      expect(summary).toEqual({ completed: 1, stillPending: 0, overdueRequestIds: [] });
      expect((await rights.requests.findById(first.requestId))?.status).toBe('completed');
      expect((await rights.report.execute({ subject: ANA })).areas.every((a) => a.records.length === 0)).toBe(true);
    });

    it('una supresión pendiente que supera el plazo se reporta como vencida', async () => {
      const rights = buildDataRightsHarness({ flaky: 'publications' });
      await rights.populate(ANA);
      const pending = await rights.erase.execute({ subject: ANA });

      rights.advanceDays(rights.policy.erasureDeadlineDays - 1);
      expect((await rights.processPending.execute()).overdueRequestIds).toEqual([]);

      rights.advanceDays(2);
      const summary = await rights.processPending.execute();

      expect(summary.stillPending).toBe(1);
      expect(summary.overdueRequestIds).toEqual([pending.requestId]);
    });

    it('con la supresión pendiente, la moderación sigue ligada al titular: no se disocia a medias', async () => {
      const rights = buildDataRightsHarness({ flaky: 'devices' });
      await rights.populate(ANA);

      await rights.erase.execute({ subject: ANA });

      expect(await rights.forum.infractions.findByStudent(ANA)).toHaveLength(1);
    });

    it('todas las áreas de datos tienen una fuente cableada (la supresión no puede olvidar un contexto)', () => {
      const rights = buildDataRightsHarness();

      expect(rights.sources.map((s) => s.area).sort()).toEqual([...PERSONAL_DATA_AREAS].sort());
    });
  });

  describe('criterio 5 — el registro de moderación se conserva disociado', () => {
    it('infracciones, sanciones y auditoría siguen existiendo, sin el correo del titular', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      const confirmation = await rights.erase.execute({ subject: ANA });
      expect(confirmation.status).toBe('completed');

      const pseudonym = rights.requests.all()[0]?.pseudonym;
      expect(pseudonym).toBeTruthy();
      expect(await rights.forum.infractions.findByStudent(ANA)).toEqual([]);
      expect(await rights.forum.sanctions.findSanctions(ANA)).toEqual([]);

      const infractions = await rights.forum.infractions.findByStudent(pseudonym!);
      expect(infractions).toEqual([expect.objectContaining({ reason: 'Lenguaje ofensivo', detectedBy: 'automatic-moderation' })]);
      const sanctions = await rights.forum.sanctions.findSanctions(pseudonym!);
      expect(sanctions).toHaveLength(1);
      expect(sanctions[0]).toMatchObject({ reason: expect.any(String), infractionCount: 1 });
      expect(rights.forum.sanctionAudit.events.length).toBeGreaterThan(0);
      expect(rights.forum.sanctionAudit.events.every((e) => !('studentEmail' in e) || e.studentEmail === pseudonym)).toBe(true);
    });

    it('nada de lo conservado contiene el correo del titular, ni siquiera la solicitud de supresión', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.erase.execute({ subject: ANA });
      const pseudonym = rights.requests.all()[0]!.pseudonym!;

      const everythingKept = JSON.stringify([
        await rights.forum.infractions.findByStudent(pseudonym),
        await rights.forum.sanctions.findSanctions(pseudonym),
        rights.forum.sanctionAudit.events,
        rights.requests.all()
      ]);

      expect(everythingKept).not.toContain(ANA);
      expect(everythingKept).not.toContain('Ana');
    });

    it('el seudonimo es aleatorio: dos supresiones del mismo correo producen seudónimos distintos', async () => {
      const first = buildDataRightsHarness();
      await first.populate(ANA);
      await first.erase.execute({ subject: ANA });
      const second = buildDataRightsHarness();
      await second.populate(ANA);
      await second.erase.execute({ subject: ANA });

      expect(first.requests.all()[0]?.pseudonym).not.toBe(second.requests.all()[0]?.pseudonym);
    });

    it('las sanciones de otros estudiantes conservan su identificador', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      await rights.populate(LUIS);

      await rights.erase.execute({ subject: ANA });

      expect(await rights.forum.infractions.findByStudent(LUIS)).toHaveLength(1);
    });
  });

  describe('criterio 6 — las convocatorias vencidas se archivan tras el periodo de la política', () => {
    const dueAt = new Date('2026-06-01T12:00:00Z');

    it('no archiva antes del periodo y sí al cumplirlo', async () => {
      const rights = buildDataRightsHarness();
      rights.convocatorias.candidates = [{ convocatoriaId: 'c-vieja', dueAt }];

      rights.advanceDays(0);
      const days = rights.policy.convocatoriaArchiveAfterDays;
      const cutoff = new Date(dueAt.getTime() + days * DAY);

      // "ahora" = 2026-09-22 ya supera 90 días desde 2026-06-01 (113 días).
      expect(cutoff.getTime()).toBeLessThan(rights.now().getTime());
      expect(await rights.archiveExpired.execute()).toEqual({ archived: 1, alreadyArchived: 0, notYetDue: 0 });
      expect(await rights.archive.findAll()).toEqual([{ convocatoriaId: 'c-vieja', dueAt, archivedAt: rights.now() }]);
    });

    it('una convocatoria vencida hace menos que el periodo sigue sin archivar', async () => {
      const rights = buildDataRightsHarness();
      const recent = new Date(rights.now().getTime() - (rights.policy.convocatoriaArchiveAfterDays - 1) * DAY);
      rights.convocatorias.candidates = [{ convocatoriaId: 'c-reciente', dueAt: recent }];

      expect(await rights.archiveExpired.execute()).toEqual({ archived: 0, alreadyArchived: 0, notYetDue: 1 });
      expect(await rights.archive.findAll()).toEqual([]);

      rights.advanceDays(1);
      expect((await rights.archiveExpired.execute()).archived).toBe(1);
    });

    it('es idempotente y no archiva convocatorias sin fecha de cierre', async () => {
      const rights = buildDataRightsHarness();
      rights.convocatorias.candidates = [
        { convocatoriaId: 'c-vieja', dueAt },
        { convocatoriaId: 'c-sin-fecha', dueAt: null }
      ];

      await rights.archiveExpired.execute();
      const second = await rights.archiveExpired.execute();

      expect(second).toEqual({ archived: 0, alreadyArchived: 1, notYetDue: 0 });
      expect((await rights.archive.findAll()).map((r) => r.convocatoriaId)).toEqual(['c-vieja']);
    });
  });

  describe('criterio 7 — confirmación del resultado y de la fecha de ejecución', () => {
    it('la confirmación trae solicitud, fecha de ejecución, lo eliminado por área y lo que se conserva', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);
      rights.advanceDays(3);

      const confirmation = await rights.erase.execute({ subject: ANA });

      expect(confirmation).toMatchObject({
        status: 'completed',
        requestedAt: rights.now(),
        executedAt: rights.now(),
        erased: { profile: 1, preferences: 1, publications: 2, applicationTracking: 2, devices: 1 },
        retained: rights.policy.retainedRecords
      });
      expect(confirmation.message).toMatch(/suprimidos/);
    });

    it('la solicitud completada no guarda el correo, solo fechas y conteos', async () => {
      const rights = buildDataRightsHarness();
      await rights.populate(ANA);

      await rights.erase.execute({ subject: ANA });

      const [request] = rights.requests.all();
      expect(request).toMatchObject({ status: 'completed', subject: null, dissociatedRecords: expect.any(Number) });
      expect(request?.executedAt).toEqual(rights.now());
    });

    it('cuando queda pendiente informa la fecha límite en la confirmación', async () => {
      const rights = buildDataRightsHarness({ flaky: 'devices' });
      await rights.populate(ANA);

      const confirmation = await rights.erase.execute({ subject: ANA });

      expect(confirmation).toMatchObject({ status: 'pending', requestedAt: rights.now() });
      expect(confirmation.message).toContain(new Date(rights.now().getTime() + rights.policy.erasureDeadlineDays * DAY).toISOString());
    });

    it('suprimir a quien no tiene datos también se confirma', async () => {
      const rights = buildDataRightsHarness();

      const confirmation = await rights.erase.execute({ subject: ANA });

      expect(confirmation).toMatchObject({ status: 'completed', erased: { profile: 0, devices: 0 } });
    });
  });
});
