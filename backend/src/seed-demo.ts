import { MongoClient } from 'mongodb';
import { SystemClock } from './infrastructure/shared/SystemClock.js';
import { MongoConvocatoriaRepository } from './contexts/feed/infrastructure/adapters/out/mongo/MongoConvocatoriaRepository.js';
import { MongoConsolidatedMessageRegistry } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoProgramTargetingRepository } from './contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { MongoClassificationResultRepository } from './contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { MongoKnowledgeEntryRepository } from './contexts/knowledge/infrastructure/adapters/out/mongo/MongoKnowledgeEntryRepository.js';
import { MongoKnowledgeAuditLog } from './contexts/knowledge/infrastructure/adapters/out/mongo/MongoKnowledgeAuditLog.js';
import { PublishKnowledgeEntry } from './contexts/knowledge/application/PublishKnowledgeEntry.js';
import { loadKnowledgeBaseSchema } from './contexts/knowledge/infrastructure/config/JsonKnowledgeBaseSchema.js';
import { MessageCategory } from './contexts/classification/domain/value-objects/MessageCategory.js';
import type { ProgramTargeting } from './contexts/targeting/domain/value-objects/ProgramTargeting.js';

/**
 * Datos de demostracion para la sustentacion: convocatorias en el feed (con
 * los tres niveles de urgencia, varias categorias y distintos destinatarios) y
 * la base de conocimiento del chatbot. Es una herramienta operativa, no parte
 * del dominio, y vive en la raiz de composicion como `create-user.ts`.
 *
 * Idempotente: los documentos usan `_id` fijos con upsert y las entradas de
 * conocimiento se omiten si ya existe una con el mismo titulo. NO borra nada.
 * Por defecto escribe en la base `upb_demo`, nunca en `upb_conecta`: para usar
 * otra hay que indicarla con `MONGODB_DATABASE` y confirmar con `--confirmar-base`.
 *
 *   npm run seed:demo
 */
const DEMO_DATABASE = 'upb_demo';
const HOUR_MS = 3_600_000;

interface DemoConvocatoria {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly sender: string;
  readonly category: MessageCategory;
  readonly targeting: ProgramTargeting;
  /** Horas hasta el cierre; null = sin vencimiento. */
  readonly closesInHours: number | null;
  readonly link: string | null;
}

const COMMUNITY: ProgramTargeting = { kind: 'all-community' };
const programs = (...programIds: string[]): ProgramTargeting => ({ kind: 'programs', programIds });

const CONVOCATORIAS: readonly DemoConvocatoria[] = [
  { id: 'demo-001', subject: 'Última semana: inscripción a la Beca Excelencia Académica 2026-2', body: 'Estudiantes con promedio acumulado superior a 4.0 pueden postularse a la Beca Excelencia Académica. La inscripción cierra pronto; adjunta certificado de notas y carta de motivación en el portal.', sender: 'bienestar@upb.edu.co', category: MessageCategory.BECA, targeting: COMMUNITY, closesInHours: 30, link: 'https://www.upb.edu.co/es/becas' },
  { id: 'demo-002', subject: 'Práctica empresarial: Analista de datos junior en Ecopetrol', body: 'Ecopetrol abre una vacante de práctica profesional para estudiantes de Ingeniería de Sistemas con interés en analítica de datos. Modalidad híbrida, seis meses. Requisitos: SQL, Python y 80% de créditos aprobados.', sender: 'practicas.ingenieria@upb.edu.co', category: MessageCategory.PRACTICA, targeting: programs('sistemas', 'industrial'), closesInHours: 60, link: 'https://www.upb.edu.co/es/practicas/ecopetrol' },
  { id: 'demo-003', subject: 'Convocatoria de movilidad académica a la Universidad de Guadalajara', body: 'Abierta la convocatoria de intercambio para el semestre 2027-1. Pueden postularse estudiantes de séptimo semestre en adelante con nivel B1 de inglés o español certificado. Cupos limitados.', sender: 'internacionalizacion@upb.edu.co', category: MessageCategory.MOVILIDAD, targeting: COMMUNITY, closesInHours: 120, link: 'https://www.upb.edu.co/es/movilidad' },
  { id: 'demo-004', subject: 'Curso de inglés intensivo B2 (cupos abiertos)', body: 'El Centro de Idiomas abre inscripciones al curso intensivo de inglés nivel B2, sábados de 8:00 a 12:00. Incluye examen de certificación al finalizar.', sender: 'idiomas@upb.edu.co', category: MessageCategory.CURSO_DE_IDIOMAS, targeting: COMMUNITY, closesInHours: 200, link: 'https://www.upb.edu.co/es/idiomas' },
  { id: 'demo-005', subject: 'Hackathon UPB Conecta: reto de 24 horas', body: 'La Facultad de Ingeniería invita al hackathon institucional. Equipos de 3 a 5 estudiantes, premios en efectivo y mentorías con empresas aliadas. Inscripción por equipo.', sender: 'ingenieria@upb.edu.co', category: MessageCategory.CONVOCATORIA_CON_PLAZO, targeting: { kind: 'faculty', facultyId: 'ingenieria' }, closesInHours: 300, link: 'https://www.upb.edu.co/es/hackathon' },
  { id: 'demo-006', subject: 'Feria de empleo y prácticas UPB 2026', body: 'Más de treinta empresas estarán en el campus presentando vacantes de práctica y primer empleo. Lleva tu hoja de vida impresa. Entrada libre con carné.', sender: 'egresados@upb.edu.co', category: MessageCategory.EVENTO, targeting: COMMUNITY, closesInHours: 450, link: null },
  { id: 'demo-007', subject: 'Práctica en gestión financiera: Bancolombia', body: 'Vacante de práctica para estudiantes de Contaduría Pública y Administración de Empresas. Apoyo en conciliaciones y reportes. Duración de seis meses con auxilio de sostenimiento.', sender: 'practicas.administrativas@upb.edu.co', category: MessageCategory.PRACTICA, targeting: programs('contaduria', 'administracion'), closesInHours: 90, link: 'https://www.upb.edu.co/es/practicas/bancolombia' },
  { id: 'demo-008', subject: 'Cierre de notas y fechas del calendario académico', body: 'Recordatorio: el cierre de notas del segundo corte es el último día hábil del mes. Consulta el calendario académico en la página de la Universidad.', sender: 'registro@upb.edu.co', category: MessageCategory.BOLETIN_INFORMATIVO, targeting: COMMUNITY, closesInHours: null, link: null },
  { id: 'demo-009', subject: 'Charla abierta: salud mental y manejo del estrés', body: 'Bienestar Universitario invita a la charla sobre manejo del estrés en época de parciales. Auditorio Juan Pablo II, entrada libre. No requiere inscripción.', sender: 'bienestar@upb.edu.co', category: MessageCategory.EVENTO, targeting: COMMUNITY, closesInHours: null, link: null },
  { id: 'demo-010', subject: 'Beca de posgrado en el exterior: programa DAAD', body: 'Convocatoria DAAD para estudios de maestría en Alemania. Dirigida a estudiantes de últimos semestres de ingeniería. Consulta requisitos y cronograma en el enlace.', sender: 'internacionalizacion@upb.edu.co', category: MessageCategory.BECA, targeting: { kind: 'faculty', facultyId: 'ingenieria' }, closesInHours: 600, link: 'https://www.daad.de' },
  { id: 'demo-011', subject: 'Semillero de psicología: convocatoria de ingreso', body: 'El semillero de investigación en psicología educativa abre cupos para estudiantes de segundo a sexto semestre.', sender: 'psicologia@upb.edu.co', category: MessageCategory.CONVOCATORIA_CON_PLAZO, targeting: programs('psicologia'), closesInHours: 150, link: null },
  { id: 'demo-012', subject: 'Boletín semanal de la comunidad UPB', body: 'Resumen de noticias de la semana: nuevas rutas del bus institucional, horario de biblioteca y resultados deportivos.', sender: 'comunicaciones@upb.edu.co', category: MessageCategory.BOLETIN_INFORMATIVO, targeting: COMMUNITY, closesInHours: null, link: null }
];

const KNOWLEDGE: ReadonlyArray<{ title: string; content: string; category: string; keywords: string[] }> = [
  { title: 'Fechas de matrícula ordinaria', content: 'La matrícula ordinaria del segundo semestre va del 3 al 14 de agosto. El pago se hace en la plataforma de pagos de la Universidad con tu documento de identidad.', category: 'matriculas', keywords: ['matrícula', 'matricula', 'pagos', 'fechas'] },
  { title: 'Cómo solicitar un certificado de notas', content: 'Los certificados de notas se solicitan en el portal de Registro Académico, opción Trámites y certificados. La entrega es digital y tarda hasta tres días hábiles.', category: 'tramites', keywords: ['certificado', 'notas', 'registro', 'trámite'] },
  { title: 'Horario de la biblioteca', content: 'La biblioteca atiende de lunes a viernes de 7:00 a.m. a 9:00 p.m. y los sábados de 8:00 a.m. a 4:00 p.m. Para ingresar se requiere el carné institucional.', category: 'general', keywords: ['biblioteca', 'horario', 'carné'] },
  { title: 'Servicios de Bienestar Universitario', content: 'Bienestar Universitario ofrece acompañamiento psicológico, deporte, cultura y apoyo socioeconómico. Escribe a bienestar@upb.edu.co o acércate a la oficina del bloque administrativo.', category: 'bienestar', keywords: ['bienestar', 'psicología', 'apoyo', 'deporte'] },
  { title: 'Requisitos de la práctica empresarial', content: 'Para iniciar la práctica debes tener aprobado el 80% de los créditos, estar matriculado y registrar la oferta ante la coordinación de tu programa antes de firmar el convenio.', category: 'practicas', keywords: ['práctica', 'practica', 'créditos', 'convenio', 'requisitos'] },
  { title: 'Calendario académico del semestre', content: 'El calendario académico con inicio de clases, cortes de notas y vacaciones está publicado en la página de la Universidad, sección Calendario académico.', category: 'calendario-academico', keywords: ['calendario', 'cortes', 'semestre', 'fechas'] }
];

async function main(): Promise<void> {
  const database = process.env['MONGODB_DATABASE'] ?? DEMO_DATABASE;
  if (database !== DEMO_DATABASE && !process.argv.includes('--confirmar-base')) {
    throw new Error(`Se pidio escribir en "${database}". Para sembrar fuera de "${DEMO_DATABASE}" agrega --confirmar-base.`);
  }
  const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
  await client.connect();
  try {
    const db = client.db(database);
    const clock = new SystemClock();
    const now = clock.now();

    await MongoConvocatoriaRepository.ensureIndexes(db);
    await MongoConsolidatedMessageRegistry.ensureIndexes(db);
    await MongoProgramTargetingRepository.ensureIndexes(db);
    await MongoClassificationResultRepository.ensureIndexes(db);
    await MongoKnowledgeEntryRepository.ensureIndexes(db);

    const targeting = new MongoProgramTargetingRepository(db);
    const classification = new MongoClassificationResultRepository(db);
    const messages = db.collection<{ _id: string }>(MongoConvocatoriaRepository.DEFAULT_COLLECTION);

    await Promise.all(
      CONVOCATORIAS.map(async (item) => {
        const sentAt = new Date(now.getTime() - 6 * HOUR_MS);
        const dueDate =
          item.closesInHours === null
            ? { kind: 'sin-vencimiento' }
            : { kind: 'con-fecha', date: new Date(now.getTime() + item.closesInHours * HOUR_MS) };
        await messages.updateOne(
          { _id: item.id },
          {
            $set: {
              sender: item.sender,
              subject: item.subject,
              body: item.body,
              representativeMessageId: item.id,
              firstSentAt: sentAt,
              lastSentAt: sentAt,
              resendCount: 0,
              dueDate,
              applicationLink: item.link,
              withdrawnAt: null
            }
          },
          { upsert: true }
        );
        await targeting.save({ messageId: item.id, targeting: item.targeting, semesterRange: null, persistedAt: now });
        await classification.save({
          messageId: item.id,
          proposedCategory: item.category,
          finalCategory: item.category,
          isKnownFalsePositiveCase: false,
          reason: null,
          appliedRuleId: null,
          confidenceScore: 0.95,
          publicationStatus: 'published',
          persistedAt: now
        });
      })
    );

    const entries = new MongoKnowledgeEntryRepository(db);
    const existingTitles = new Set((await entries.findAll()).map((entry) => entry.title));
    let sequence = existingTitles.size;
    const publish = new PublishKnowledgeEntry({
      entries,
      auditLog: new MongoKnowledgeAuditLog(db),
      idGenerator: { next: () => `demo-kb-${String(++sequence).padStart(3, '0')}` },
      schema: await loadKnowledgeBaseSchema(),
      clock
    });
    const pending = KNOWLEDGE.filter((entry) => !existingTitles.has(entry.title));
    await Promise.all(
      pending.map(async (entry) => {
        const result = await publish.execute({ publishedBy: 'contenido@upb.edu.co', form: entry });
        if (!result.ok) throw new Error(`No se pudo publicar "${entry.title}": ${JSON.stringify(result)}`);
      })
    );
    const published = pending.length;

    console.log(`[seed-demo] base "${database}": ${CONVOCATORIAS.length} convocatorias (upsert), ${published} entradas nuevas de conocimiento`);
  } finally {
    await client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error('[seed-demo] fallo:', error);
  process.exit(1);
}
