import { describe, expect, it } from 'vitest';
import { PostRejectionKind } from '../../src/contexts/forum/application/CreatePost.js';
import { TopicManagementFailureKind } from '../../src/contexts/forum/application/ManageTopics.js';
import { ANONYMITY_NOT_ALLOWED_MESSAGE } from '../../src/contexts/forum/domain/entities/Post.js';
import { allCommunityTargeting, facultyTargeting, programTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { buildForumHarness, STUDENTS } from './forumHarness.js';

const ADMIN = 'admin-foro@upb.edu.co';
const body = (overrides: Record<string, unknown> = {}) => ({ title: 'Vendo calculadora', text: 'Casio fx-991, poco uso.', ...overrides });

async function withSeededForum() {
  const forum = buildForumHarness();
  await forum.seed.execute(forum.seedTopics);
  return forum;
}

describe('HU-30 — foro con identidad verificada y temas administrables (RF-46, RF-47, RNF-14; CU-03 pasos 1 y 2, E2)', () => {
  describe('criterio 1 — la publicación queda asociada a nombre y programa del directorio', () => {
    it('el login sincroniza el autor verificado y la publicación lleva su nombre y programa', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'compraventa', body: body() });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.post.author).toEqual({ name: 'Ana Gómez', program: 'Ingeniería de Sistemas' });
      const stored = await forum.posts.findByTopic('compraventa');
      expect(stored[0]?.author).toEqual({
        email: 'ana@upb.edu.co',
        name: 'Ana Gómez',
        programName: 'Ingeniería de Sistemas',
        programId: 'sistemas'
      });
    });

    it('usa los datos del directorio vigentes al publicar: un cambio en el directorio aplica tras el siguiente login', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');
      await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body({ title: 'Antes' }) });

      forum.changeDirectory('ana', { name: 'Ana María Gómez', program: 'Ingeniería Industrial' });
      await forum.login('ana');
      forum.advanceHours(1);
      await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body({ title: 'Después' }) });

      const [latest, earlier] = await forum.listPosts.execute({ viewerEmail: 'ana@upb.edu.co', topicId: 'general' }).then((r) => {
        if (!r.ok) throw new Error(r.message);
        return r.posts;
      });
      expect(latest?.author).toEqual({ name: 'Ana María Gómez', program: 'Ingeniería Industrial' });
      // La publicación anterior conserva el nombre con que se firmó.
      expect(earlier?.author).toEqual({ name: 'Ana Gómez', program: 'Ingeniería de Sistemas' });
    });

    it('la vista pública no expone el correo del autor', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body() });

      expect(JSON.stringify(result)).not.toContain('ana@upb.edu.co');
    });
  });

  describe('criterio 2 — no se admiten publicaciones anónimas ni bajo seudónimo', () => {
    it.each([
      [{ alias: 'ElVendedor' }],
      [{ displayName: 'Anónimo' }],
      [{ authorName: 'Otra Persona' }],
      [{ anonymous: true }],
      [{ name: 'Otra' }],
      [{ program: 'Medicina' }],
      [{ pseudonym: 'x' }]
    ])('rechaza el cuerpo con campo de identidad %o y no guarda nada', async (extra) => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body(extra) });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.IDENTITY_FIELDS_NOT_ALLOWED, message: ANONYMITY_NOT_ALLOWED_MESSAGE });
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
    });

    it('rechaza a quien no tiene autor verificado (nunca se autenticó contra el directorio)', async () => {
      const forum = await withSeededForum();

      const result = await forum.createPost.execute({ authorEmail: 'fantasma@upb.edu.co', topicId: 'general', body: body() });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.AUTHOR_NOT_VERIFIED });
    });

    it('rechaza si el directorio entregó el nombre vacío', async () => {
      const forum = await withSeededForum();
      forum.changeDirectory('ana', { name: '  ' });
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body() });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.AUTHOR_NOT_VERIFIED });
    });

    it.each([
      [{ title: '' }],
      [{ text: '   ' }],
      [{ title: 'x'.repeat(151) }],
      [{ text: 'x'.repeat(5001) }],
      [{ title: 42 }]
    ])('valida el contenido %o', async (overrides) => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body(overrides) });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.INVALID_CONTENT });
    });

    it('rechaza campos que la publicación no conoce', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body({ precio: 10 }) });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.UNKNOWN_FIELD, fields: ['precio'] });
    });
  });

  describe('criterio 3 — temas definidos por el administrador', () => {
    it('el foro sembrado ofrece académico, compraventa, eventos y espacio general', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const topics = await forum.listTopics.execute('ana@upb.edu.co');

      expect(topics.map((t) => t.id).sort()).toEqual(['academico', 'compraventa', 'eventos', 'general']);
      expect(topics.find((t) => t.id === 'compraventa')).toMatchObject({ name: 'Compraventa entre estudiantes', restricted: false });
    });

    it('sembrar dos veces no duplica ni pisa lo que el administrador editó', async () => {
      const forum = await withSeededForum();
      await forum.manage.edit({ topicId: 'eventos', name: 'Eventos y actividades', performedBy: ADMIN });

      await forum.seed.execute(forum.seedTopics);

      expect((await forum.topics.findAll()).length).toBe(4);
      expect((await forum.topics.findById('eventos'))?.name).toBe('Eventos y actividades');
    });

    it('sin autor verificado, el listado solo muestra los temas abiertos a toda la comunidad', async () => {
      const forum = await withSeededForum();
      await forum.manage.create({ name: 'Semilleros', description: '', restriction: programTargeting(['sistemas']), performedBy: ADMIN });

      const topics = (await forum.listTopics.execute('fantasma@upb.edu.co')).map((t) => t.id);

      expect(topics).toHaveLength(4);
      expect(topics).not.toContain('semilleros');
    });

    it('el listado muestra solo los temas activos a los que el estudiante tiene acceso', async () => {
      const forum = await withSeededForum();
      await forum.manage.create({ name: 'Semilleros de Sistemas', description: 'Solo sistemas', restriction: programTargeting(['sistemas']), performedBy: ADMIN });
      await forum.manage.retire({ topicId: 'eventos', performedBy: ADMIN });
      await forum.login('ana');
      await forum.login('luis');

      const ana = (await forum.listTopics.execute('ana@upb.edu.co')).map((t) => t.id);
      const luis = (await forum.listTopics.execute('luis@upb.edu.co')).map((t) => t.id);

      expect(ana).toContain('semilleros-de-sistemas');
      expect(luis).not.toContain('semilleros-de-sistemas');
      expect(ana).not.toContain('eventos');
      expect((await forum.listTopics.execute('ana@upb.edu.co')).find((t) => t.id === 'semilleros-de-sistemas')?.restricted).toBe(true);
    });
  });

  describe('criterio 4 — tema restringido por programa: rechazo en servidor y auditoría', () => {
    async function withRestrictedTopic() {
      const forum = await withSeededForum();
      const created = await forum.manage.create({
        name: 'Semilleros de Sistemas',
        description: 'Solo para Ingeniería de Sistemas',
        restriction: programTargeting(['sistemas']),
        performedBy: ADMIN
      });
      if (!created.ok) throw new Error(created.message);
      await forum.login('ana');
      await forum.login('luis');
      return forum;
    }

    it('un estudiante de otro programa no puede publicar y el intento queda registrado', async () => {
      const forum = await withRestrictedTopic();

      const result = await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.TOPIC_RESTRICTED });
      expect(forum.audit.events).toEqual([
        {
          kind: 'topic-access-denied',
          operation: 'publish',
          studentEmail: 'luis@upb.edu.co',
          studentProgramId: 'psicologia',
          topicId: 'semilleros-de-sistemas',
          occurredAt: forum.now()
        }
      ]);
      expect(await forum.posts.findByTopic('semilleros-de-sistemas')).toHaveLength(0);
    });

    it('tampoco puede leer el tema, y la lectura rechazada también queda registrada', async () => {
      const forum = await withRestrictedTopic();

      const result = await forum.listPosts.execute({ viewerEmail: 'luis@upb.edu.co', topicId: 'semilleros-de-sistemas' });

      expect(result).toMatchObject({ ok: false, error: 'topic-restricted' });
      expect(forum.audit.events.map((e) => e.operation)).toEqual(['read']);
    });

    it('un estudiante del programa sí publica y lee, sin eventos de auditoría', async () => {
      const forum = await withRestrictedTopic();

      const created = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });
      const read = await forum.listPosts.execute({ viewerEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas' });

      expect(created.ok).toBe(true);
      expect(read.ok && read.posts).toHaveLength(1);
      expect(forum.audit.events).toHaveLength(0);
    });

    it('la restricción por facultad admite todos sus programas y ninguno ajeno', async () => {
      const forum = await withSeededForum();
      await forum.manage.create({ name: 'Ingeniería', description: 'Facultad', restriction: facultyTargeting('ingenieria'), performedBy: ADMIN });
      await forum.login('ana');
      await forum.login('luis');

      expect((await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'ingenieria', body: body() })).ok).toBe(true);
      expect((await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'ingenieria', body: body() })).ok).toBe(false);
    });

    it('un programa del directorio que el catálogo no reconoce no entra a temas restringidos', async () => {
      const forum = await withRestrictedTopic();
      await forum.login('eva');

      const result = await forum.createPost.execute({ authorEmail: 'eva@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });
      const open = await forum.createPost.execute({ authorEmail: 'eva@upb.edu.co', topicId: 'general', body: body() });

      expect(result).toMatchObject({ ok: false, error: PostRejectionKind.TOPIC_RESTRICTED });
      expect(forum.audit.events[0]).toMatchObject({ studentProgramId: null });
      expect(open.ok).toBe(true);
    });

    describe('cambios de programa después de publicar', () => {
      it('la restricción se evalúa al publicar; si el autor cambia de programa, su publicación no se retira', async () => {
        const forum = await withRestrictedTopic();
        await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });

        forum.changeDirectory('ana', { program: 'Psicología' });
        await forum.login('ana');

        const stored = await forum.posts.findByTopic('semilleros-de-sistemas');
        expect(stored).toHaveLength(1);
        // La copia conserva el programa con que se publicó, que era válido en ese momento.
        expect(stored[0]?.author).toMatchObject({ programName: 'Ingeniería de Sistemas', programId: 'sistemas' });
        expect(forum.audit.events).toHaveLength(0);
      });

      it('desde su siguiente login, el autor que cambió de programa ya no puede publicar ni leer en el tema', async () => {
        const forum = await withRestrictedTopic();
        await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });
        forum.changeDirectory('ana', { program: 'Psicología' });
        await forum.login('ana');

        const publish = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });
        const read = await forum.listPosts.execute({ viewerEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas' });

        expect(publish).toMatchObject({ ok: false, error: PostRejectionKind.TOPIC_RESTRICTED });
        expect(read).toMatchObject({ ok: false, error: 'topic-restricted' });
        expect(forum.audit.events.map((e) => [e.operation, e.studentProgramId])).toEqual([
          ['publish', 'psicologia'],
          ['read', 'psicologia']
        ]);
      });

      it('mientras no vuelva a iniciar sesión, el foro usa el programa de su último login', async () => {
        const forum = await withRestrictedTopic();
        forum.changeDirectory('ana', { program: 'Psicología' });

        const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });

        expect(result.ok).toBe(true);
      });

      it('los estudiantes del programa siguen viendo la publicación de quien se fue', async () => {
        const forum = await withRestrictedTopic();
        await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'semilleros-de-sistemas', body: body() });
        forum.changeDirectory('ana', { program: 'Psicología' });
        await forum.login('ana');
        forum.changeDirectory('luis', { program: 'Ingeniería de Sistemas' });
        await forum.login('luis');

        const read = await forum.listPosts.execute({ viewerEmail: 'luis@upb.edu.co', topicId: 'semilleros-de-sistemas' });

        expect(read.ok && read.posts.map((p) => p.author)).toEqual([{ name: 'Ana Gómez', program: 'Ingeniería de Sistemas' }]);
      });

      it('endurecer la restricción de un tema tampoco retira las publicaciones ya hechas', async () => {
        const forum = await withSeededForum();
        await forum.login('luis');
        await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'academico', body: body() });

        await forum.manage.restrict({ topicId: 'academico', restriction: programTargeting(['sistemas']), performedBy: ADMIN });

        expect(await forum.posts.findByTopic('academico')).toHaveLength(1);
        expect((await forum.listPosts.execute({ viewerEmail: 'luis@upb.edu.co', topicId: 'academico' })).ok).toBe(false);
      });
    });

    it('un tema inexistente o retirado se rechaza sin auditar (no es un intento sobre un tema restringido)', async () => {
      const forum = await withSeededForum();
      await forum.manage.retire({ topicId: 'eventos', performedBy: ADMIN });
      await forum.login('ana');

      const retired = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'eventos', body: body() });
      const missing = await forum.listPosts.execute({ viewerEmail: 'ana@upb.edu.co', topicId: 'no-existe' });

      expect(retired).toMatchObject({ ok: false, error: PostRejectionKind.TOPIC_NOT_FOUND });
      expect(missing).toMatchObject({ ok: false, error: 'topic-not-found' });
      expect(forum.audit.events).toHaveLength(0);
    });

    it('leer exige autor verificado', async () => {
      const forum = await withSeededForum();

      const result = await forum.listPosts.execute({ viewerEmail: 'fantasma@upb.edu.co', topicId: 'general' });

      expect(result).toMatchObject({ ok: false, error: 'author-not-verified' });
    });
  });

  describe('criterio 5 — el administrador gestiona los temas sin el equipo de desarrollo', () => {
    it('crea un tema nuevo que aparece de inmediato en el listado', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');

      const created = await forum.manage.create({ name: 'Deportes', description: 'Torneos internos', performedBy: ADMIN });

      expect(created).toMatchObject({ ok: true, topic: { id: 'deportes', status: 'active', updatedBy: ADMIN, restriction: allCommunityTargeting() } });
      expect((await forum.listTopics.execute('ana@upb.edu.co')).map((t) => t.id)).toContain('deportes');
    });

    it('edita nombre y descripción conservando el id', async () => {
      const forum = await withSeededForum();
      forum.advanceHours(2);

      const edited = await forum.manage.edit({ topicId: 'general', name: 'Espacio abierto', description: 'De todo un poco', performedBy: ADMIN });

      expect(edited).toMatchObject({ ok: true, topic: { id: 'general', name: 'Espacio abierto', description: 'De todo un poco', updatedAt: forum.now() } });
    });

    it('restringe y luego libera un tema: el cambio aplica en la siguiente operación', async () => {
      const forum = await withSeededForum();
      await forum.login('luis');

      await forum.manage.restrict({ topicId: 'academico', restriction: programTargeting(['sistemas']), performedBy: ADMIN });
      const blocked = await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'academico', body: body() });
      await forum.manage.restrict({ topicId: 'academico', restriction: allCommunityTargeting(), performedBy: ADMIN });
      const allowed = await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'academico', body: body() });

      expect(blocked.ok).toBe(false);
      expect(allowed.ok).toBe(true);
    });

    it('retira un tema (deja de listarse y de admitir publicaciones) conservando sus publicaciones, y lo reactiva', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');
      await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'eventos', body: body() });

      await forum.manage.retire({ topicId: 'eventos', performedBy: ADMIN });
      expect((await forum.listTopics.execute('ana@upb.edu.co')).map((t) => t.id)).not.toContain('eventos');
      expect(await forum.posts.findByTopic('eventos')).toHaveLength(1);

      await forum.manage.reactivate({ topicId: 'eventos', performedBy: ADMIN });
      expect((await forum.listTopics.execute('ana@upb.edu.co')).map((t) => t.id)).toContain('eventos');
    });

    it.each([
      [{ name: '' }, TopicManagementFailureKind.INVALID_TOPIC],
      [{ name: 'x'.repeat(81) }, TopicManagementFailureKind.INVALID_TOPIC],
      [{ name: 'Académico' }, TopicManagementFailureKind.DUPLICATE_TOPIC],
      [{ name: '¡¡¡???' }, TopicManagementFailureKind.INVALID_TOPIC],
      [{ name: 'Nuevo', description: 'x'.repeat(501) }, TopicManagementFailureKind.INVALID_TOPIC],
      [{ name: 'Nuevo', restriction: programTargeting(['medicina']) }, TopicManagementFailureKind.UNKNOWN_PROGRAM],
      [{ name: 'Nuevo', restriction: facultyTargeting('derecho') }, TopicManagementFailureKind.UNKNOWN_FACULTY]
    ])('rechaza crear %o', async (input, error) => {
      const forum = await withSeededForum();

      const result = await forum.manage.create({ description: '', performedBy: ADMIN, ...input } as Parameters<typeof forum.manage.create>[0]);

      expect(result).toMatchObject({ ok: false, error });
    });

    it('las operaciones sobre un tema inexistente fallan sin crear nada', async () => {
      const forum = await withSeededForum();

      const results = await Promise.all([
        forum.manage.edit({ topicId: 'no-existe', name: 'x', performedBy: ADMIN }),
        forum.manage.restrict({ topicId: 'no-existe', restriction: allCommunityTargeting(), performedBy: ADMIN }),
        forum.manage.retire({ topicId: 'no-existe', performedBy: ADMIN }),
        forum.manage.reactivate({ topicId: 'no-existe', performedBy: ADMIN })
      ]);

      for (const result of results) expect(result).toMatchObject({ ok: false, error: TopicManagementFailureKind.TOPIC_NOT_FOUND });
      expect(await forum.topics.findById('no-existe')).toBeNull();
    });

    it('editar con datos inválidos o restringir a un programa desconocido se rechaza', async () => {
      const forum = await withSeededForum();

      expect(await forum.manage.edit({ topicId: 'general', name: '  ', performedBy: ADMIN })).toMatchObject({
        ok: false,
        error: TopicManagementFailureKind.INVALID_TOPIC
      });
      expect(
        await forum.manage.restrict({ topicId: 'general', restriction: programTargeting(['medicina']), performedBy: ADMIN })
      ).toMatchObject({ ok: false, error: TopicManagementFailureKind.UNKNOWN_PROGRAM });
    });
  });

  describe('criterio 6 — sanción activa', () => {
    it('rechaza la publicación e informa la fecha en que termina la sanción', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');
      forum.sanctions.impose('ana@upb.edu.co', { startsAt: new Date('2026-09-20T00:00:00Z'), endsAt: new Date('2026-09-30T22:00:00Z') });

      const result = await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body() });

      expect(result).toMatchObject({
        ok: false,
        error: PostRejectionKind.SANCTIONED,
        sanctionEndsAt: new Date('2026-09-30T22:00:00Z')
      });
      if (result.ok) throw new Error('debía rechazarse');
      expect(result.message).toContain('30 de septiembre de 2026');
      expect(await forum.posts.findByTopic('general')).toHaveLength(0);
    });

    it('al terminar la sanción vuelve a poder publicar', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');
      forum.sanctions.impose('ana@upb.edu.co', { startsAt: new Date('2026-09-20T00:00:00Z'), endsAt: new Date('2026-09-22T14:00:00Z') });

      expect((await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body() })).ok).toBe(false);
      forum.advanceHours(2);
      expect((await forum.createPost.execute({ authorEmail: 'ana@upb.edu.co', topicId: 'general', body: body() })).ok).toBe(true);
    });

    it('la sanción impide publicar pero no leer', async () => {
      const forum = await withSeededForum();
      await forum.login('ana');
      forum.sanctions.impose('ana@upb.edu.co', { startsAt: new Date('2026-09-20T00:00:00Z'), endsAt: new Date('2026-09-30T00:00:00Z') });

      expect((await forum.listPosts.execute({ viewerEmail: 'ana@upb.edu.co', topicId: 'general' })).ok).toBe(true);
    });

    it('sin sanción configurada, el doble no bloquea a nadie', async () => {
      const forum = await withSeededForum();
      await forum.login('luis');

      expect((await forum.createPost.execute({ authorEmail: 'luis@upb.edu.co', topicId: 'general', body: body() })).ok).toBe(true);
    });
  });

  it('el correo de la sesión se normaliza: mayúsculas y espacios no cambian al autor', async () => {
    const forum = await withSeededForum();
    await forum.login('ana');

    const result = await forum.createPost.execute({ authorEmail: '  ANA@upb.edu.co ', topicId: 'general', body: body() });

    expect(result.ok).toBe(true);
    expect(STUDENTS.ana.email).toBe('ana@upb.edu.co');
  });
});
