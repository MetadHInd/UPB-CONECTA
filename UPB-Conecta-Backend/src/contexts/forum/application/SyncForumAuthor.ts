import { normalizeForumEmail, type DirectoryAuthorRecord, type ForumAuthor } from '../domain/entities/ForumAuthor.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ForumAuthorRepositoryPort } from '../domain/ports/out/ForumAuthorRepositoryPort.js';
import type { ForumProgramCatalogPort } from '../domain/ports/out/ForumProgramCatalogPort.js';

/**
 * Refresca el autor verificado con lo que trae el directorio en cada
 * autenticacion (HU-30 criterio 1). Copia campo a campo: el codigo
 * estudiantil, el semestre y lo que el directorio agregue en el futuro no
 * llegan al foro.
 */
export class SyncForumAuthor {
  constructor(
    private readonly dependencies: {
      readonly authors: ForumAuthorRepositoryPort;
      readonly clock: ClockPort;
      readonly programs: ForumProgramCatalogPort;
    }
  ) {}

  async execute(record: DirectoryAuthorRecord): Promise<ForumAuthor> {
    const { authors, clock, programs } = this.dependencies;
    const author: ForumAuthor = {
      email: normalizeForumEmail(record.email),
      name: record.name.trim(),
      programName: record.program.trim(),
      programId: programs.resolveProgramId(record.program),
      syncedAt: clock.now()
    };
    await authors.save(author);
    return author;
  }
}
