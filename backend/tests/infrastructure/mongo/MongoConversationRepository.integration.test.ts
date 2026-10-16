import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoConversationRepository } from '../../../src/contexts/messaging/infrastructure/adapters/out/mongo/MongoConversationRepository.js';
import { IdentityMessagingDirectoryAdapter } from '../../../src/contexts/messaging/infrastructure/integration/IdentityMessagingDirectoryAdapter.js';
import { MongoIdentityProviderAdapter } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoIdentityProviderAdapter.js';
import { MongoAccountRoleRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { seedTestAccounts } from '../../../src/contexts/identity/infrastructure/seed/TestAccountSeeder.js';
import { Role } from '../../../src/contexts/identity/domain/value-objects/Role.js';
import type { Conversation } from '../../../src/contexts/messaging/domain/entities/Conversation.js';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const DATABASE = process.env['MONGODB_TEST_DATABASE'] ?? 'upb_conecta_test';
const CONVERSATIONS = 'messaging_conversations_test';
const USERS = 'identity_users_messaging_test';
const ROLES = 'identity_roles_messaging_test';

const professor = { email: 'profesor@upb.edu.co', name: 'Ricardo Méndez' };
const student = { email: 'julian.vargas@upb.edu.co', name: 'Julián Vargas' };

function conversation(id: string, at: Date, studentOverride = student): Conversation {
  return {
    id,
    professor,
    student: studentOverride,
    subject: `Asunto ${id}`,
    messages: [{ id: `${id}-m1`, authorEmail: professor.email, authorName: professor.name, fromProfessor: true, text: 'Hola', sentAt: at }],
    createdAt: at,
    updatedAt: at
  };
}

describe('Mensajería sobre MongoDB real', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE);
    await MongoConversationRepository.ensureIndexes(db, CONVERSATIONS);
  });

  beforeEach(async () => {
    for (const name of [CONVERSATIONS, USERS, ROLES]) await db.collection(name).deleteMany({});
  });

  afterAll(async () => {
    for (const name of [CONVERSATIONS, USERS, ROLES]) await db.collection(name).drop().catch(() => undefined);
    await client.close();
  });

  it('guarda, agrega mensajes y lista la bandeja de cada participante con su último mensaje', async () => {
    const repository = new MongoConversationRepository(db, CONVERSATIONS);
    const t0 = new Date('2026-10-08T15:00:00Z');
    await repository.save(conversation('c1', t0));
    await repository.save(conversation('c2', new Date(t0.getTime() + 60_000), { email: 'camila.torres@upb.edu.co', name: 'Camila Torres' }));

    const reply = { id: 'c1-m2', authorEmail: student.email, authorName: student.name, fromProfessor: false, text: 'Hola profe', sentAt: new Date(t0.getTime() + 120_000) };
    expect(await repository.appendMessage('c1', reply)).toBe(true);
    expect(await repository.appendMessage('no-existe', reply)).toBe(false);

    const stored = await repository.findById('c1');
    expect(stored?.messages.map((m) => m.text)).toEqual(['Hola', 'Hola profe']);
    expect(stored?.updatedAt).toEqual(reply.sentAt);

    const professorInbox = await repository.findSummariesByParticipant(professor.email);
    expect(professorInbox.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(professorInbox[0]?.lastMessage?.text).toBe('Hola profe');

    const studentInbox = await repository.findSummariesByParticipant(student.email);
    expect(studentInbox.map((c) => c.id)).toEqual(['c1']);
    expect(await repository.findSummariesByParticipant('otro@upb.edu.co')).toEqual([]);
  });

  it('el directorio de mensajería lee nombre y rol de identity (estudiantes y profesores sembrados)', async () => {
    const users = new MongoIdentityProviderAdapter(db, USERS);
    const roles = new MongoAccountRoleRepository(db, ROLES);
    await seedTestAccounts(users, roles);
    const directory = new IdentityMessagingDirectoryAdapter({ profiles: users, roles });

    expect(await directory.findByEmail('profesor@upb.edu.co')).toEqual({
      email: 'profesor@upb.edu.co',
      name: 'Ricardo Méndez',
      role: 'professor',
      program: 'Ingeniería de Sistemas'
    });
    expect(await directory.findByEmail('nadie@upb.edu.co')).toBeNull();

    await roles.save({ subject: 'carlos.ramirez@upb.edu.co', role: Role.CONTENT_ADMIN, assignedAt: new Date(), assignedBy: 'test' });
    const students = await directory.listStudents();
    expect(students).toHaveLength(9);
    expect(students.every((s) => s.role === 'student')).toBe(true);
    expect(students.find((s) => s.email === 'julian.vargas@upb.edu.co')).toMatchObject({ semester: 10 });
  });
});
