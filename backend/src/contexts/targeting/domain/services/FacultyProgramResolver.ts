import type { InstitutionalProgramCatalog } from '../ports/out/ProgramCatalogPort.js';

export class FacultyProgramResolver {
  constructor(private readonly catalog: InstitutionalProgramCatalog) {}

  resolveFacultyPrograms(facultyId: string): readonly string[] {
    const faculty = this.catalog.faculties.find(
      (candidate) => candidate.id === facultyId || candidate.name.toLowerCase() === facultyId.toLowerCase()
    );

    if (!faculty) {
      throw new Error(`No existe la facultad "${facultyId}" en el catálogo institucional.`);
    }

    return [...faculty.programIds];
  }
}
