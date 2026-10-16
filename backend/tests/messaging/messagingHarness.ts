import { GetConversation } from '../../src/contexts/messaging/application/GetConversation.js';
import { ListConversations } from '../../src/contexts/messaging/application/ListConversations.js';
import { ListMessagingStudents } from '../../src/contexts/messaging/application/ListMessagingStudents.js';
import { SendMessage } from '../../src/contexts/messaging/application/SendMessage.js';
import { StartConversation } from '../../src/contexts/messaging/application/StartConversation.js';
import type { DirectoryEntry, MessagingDirectoryPort } from '../../src/contexts/messaging/domain/ports/out/MessagingDirectoryPort.js';
import { InMemoryConversationRepository } from '../../src/contexts/messaging/infrastructure/adapters/out/memory/InMemoryConversationRepository.js';

export const PROFESSOR: DirectoryEntry = { email: 'profesor@upb.edu.co', name: 'Ricardo Méndez', role: 'professor', program: 'Ingeniería de Sistemas' };
export const OTHER_PROFESSOR: DirectoryEntry = { email: 'patricia.suarez@upb.edu.co', name: 'Patricia Suárez', role: 'professor', program: 'Ingeniería Industrial' };
export const STUDENT: DirectoryEntry = { email: 'julian.vargas@upb.edu.co', name: 'Julián Vargas', role: 'student', program: 'Ingeniería Industrial', semester: 10 };
export const OTHER_STUDENT: DirectoryEntry = { email: 'camila.torres@upb.edu.co', name: 'Camila Torres', role: 'student', program: 'Psicología', semester: 8 };
export const ADMIN: DirectoryEntry = { email: 'admin@upb.edu.co', name: 'Admin', role: 'other', program: 'Ingeniería de Sistemas' };

export function fixedDirectory(entries: readonly DirectoryEntry[] = [PROFESSOR, OTHER_PROFESSOR, STUDENT, OTHER_STUDENT, ADMIN]): MessagingDirectoryPort {
  return {
    findByEmail: async (email) => entries.find((entry) => entry.email === email) ?? null,
    listStudents: async () => entries.filter((entry) => entry.role === 'student')
  };
}

export function buildMessagingHarness(directory: MessagingDirectoryPort = fixedDirectory()) {
  let now = new Date('2026-10-08T15:00:00Z');
  let seq = 0;
  const clock = { now: () => now };
  const ids = { newId: () => `id-${++seq}` };
  const conversations = new InMemoryConversationRepository();

  return {
    conversations,
    advance(minutes: number) {
      now = new Date(now.getTime() + minutes * 60_000);
    },
    useCases: {
      listConversations: new ListConversations({ conversations }),
      getConversation: new GetConversation({ conversations }),
      startConversation: new StartConversation({ conversations, directory, clock, ids }),
      sendMessage: new SendMessage({ conversations, clock, ids }),
      listStudents: new ListMessagingStudents({ directory })
    }
  };
}
