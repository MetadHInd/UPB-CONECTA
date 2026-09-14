import type { ConsentStatusResult, GetConsentStatusPort, GetConsentStatusQuery } from '../domain/ports/in/GetConsentStatusPort.js';
import type { ConsentRepositoryPort } from '../domain/ports/out/ConsentRepositoryPort.js';
import { ConsentPolicy } from '../domain/services/ConsentPolicy.js';

export interface GetConsentStatusDependencies {
  readonly repository: ConsentRepositoryPort;
  readonly policy: ConsentPolicy;
}

/**
 * HU-44, criterios 1, 3 y 6: determina si el estudiante puede continuar
 * (o debe (re)consentir) y expone el historico completo de aceptaciones.
 */
export class GetConsentStatus implements GetConsentStatusPort {
  constructor(private readonly deps: GetConsentStatusDependencies) {}

  async execute(query: GetConsentStatusQuery): Promise<ConsentStatusResult> {
    const { repository, policy } = this.deps;
    const latest = await repository.findLatest(query.studentId, query.documentType);
    const status = policy.evaluate(latest, query.currentVersion);
    const history = await repository.findHistory(query.studentId, query.documentType);
    return { status, history };
  }
}
