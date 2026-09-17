export interface InstitutionalProgram {
  readonly id: string;
  readonly name: string;
  readonly facultyId: string;
}

export interface InstitutionalFaculty {
  readonly id: string;
  readonly name: string;
  readonly programIds: readonly string[];
}

export interface InstitutionalProgramCatalog {
  readonly faculties: readonly InstitutionalFaculty[];
  readonly programs: readonly InstitutionalProgram[];
}
