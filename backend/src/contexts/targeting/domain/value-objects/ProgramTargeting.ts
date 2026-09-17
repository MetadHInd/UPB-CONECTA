export type ProgramTargeting =
  | { readonly kind: 'all-community' }
  | { readonly kind: 'faculty'; readonly facultyId: string }
  | { readonly kind: 'programs'; readonly programIds: readonly string[] };

export function allCommunityTargeting(): ProgramTargeting {
  return { kind: 'all-community' };
}

export function facultyTargeting(facultyId: string): ProgramTargeting {
  if (!facultyId.trim()) {
    throw new Error('La facultad destino no puede estar vacia.');
  }

  return { kind: 'faculty', facultyId };
}

export function programTargeting(programIds: readonly string[]): ProgramTargeting {
  const uniqueIds = Array.from(new Set(programIds.filter((id) => id && id.trim().length > 0)));

  if (uniqueIds.length === 0) {
    return allCommunityTargeting();
  }

  return { kind: 'programs', programIds: uniqueIds };
}

export function targetingProgramIds(targeting: ProgramTargeting): readonly string[] {
  switch (targeting.kind) {
    case 'all-community':
      return [];
    case 'faculty':
      return [];
    case 'programs':
      return [...targeting.programIds];
  }
}
