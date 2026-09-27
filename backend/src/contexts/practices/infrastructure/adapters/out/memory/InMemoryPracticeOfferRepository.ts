import type { PracticeOfferDetails } from '../../../../domain/entities/PracticeOffer.js';
import type { PracticeOfferRepositoryPort } from '../../../../domain/ports/out/PracticeOfferRepositoryPort.js';

export class InMemoryPracticeOfferRepository implements PracticeOfferRepositoryPort {
  private readonly offers = new Map<string, PracticeOfferDetails>();

  async findByMessageId(messageId: string): Promise<PracticeOfferDetails | null> {
    return this.offers.get(messageId) ?? null;
  }

  async save(offer: PracticeOfferDetails): Promise<void> {
    this.offers.set(offer.messageId, offer);
  }
}
