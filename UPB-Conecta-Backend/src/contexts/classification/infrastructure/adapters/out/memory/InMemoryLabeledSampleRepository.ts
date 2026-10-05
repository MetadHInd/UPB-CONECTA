import type { LabeledSample, LabeledSampleRepositoryPort } from '../../../../domain/ports/out/LabeledSampleRepositoryPort.js';

export class InMemoryLabeledSampleRepository implements LabeledSampleRepositoryPort {
  private readonly samples = new Map<string, LabeledSample>();

  async save(sample: LabeledSample): Promise<void> {
    this.samples.set(sample.messageId, sample);
  }

  async findAll(): Promise<readonly LabeledSample[]> {
    return [...this.samples.values()];
  }
}
