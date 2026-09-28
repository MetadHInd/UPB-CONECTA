import type {
  ModerationLabeledSample,
  ModerationLabeledSampleRepositoryPort
} from '../../../../domain/ports/out/ModerationLabeledSampleRepositoryPort.js';

export class InMemoryModerationLabeledSamples implements ModerationLabeledSampleRepositoryPort {
  private readonly samples = new Map<string, ModerationLabeledSample>();

  async save(sample: ModerationLabeledSample): Promise<void> {
    this.samples.set(sample.sampleId, { ...sample });
  }

  async findAll(): Promise<readonly ModerationLabeledSample[]> {
    return [...this.samples.values()].map((sample) => ({ ...sample }));
  }
}
