import type { Collection, Db } from 'mongodb';
import type { SanctionNotice, SanctionNotificationPort } from '../../../../domain/ports/out/SanctionNotificationPort.js';

export const ADMINISTRATORS_RECIPIENT = 'content-admins';

export type SanctionNoticeDocument = SanctionNotice & {
  /** Correo del estudiante, o `content-admins` para los administradores de contenido. */
  readonly recipient: string;
  readonly deliveredAt: Date | null;
};

/**
 * Bandeja persistente de avisos de sancion (HU-35 criterio 2). No hay todavia
 * un canal de entrega (push del foro, correo o panel de administracion):
 * cada aviso queda aqui con `deliveredAt: null` para que ese canal lo
 * consuma. Guardarlo al imponer la sancion asegura que ningun aviso se pierde
 * aunque el canal no exista o este caido.
 */
export class MongoSanctionNoticeOutbox implements SanctionNotificationPort {
  static readonly COLLECTION = 'forum_sanction_notices';

  private readonly collection: Collection<SanctionNoticeDocument>;

  constructor(db: Db, collectionName = MongoSanctionNoticeOutbox.COLLECTION) {
    this.collection = db.collection<SanctionNoticeDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoSanctionNoticeOutbox.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ recipient: 1, deliveredAt: 1 }, { name: 'idx_recipient_pending' });
  }

  async notifyStudent(notice: SanctionNotice): Promise<void> {
    await this.collection.insertOne({ ...notice, recipient: notice.studentEmail, deliveredAt: null });
  }

  async notifyAdministrators(notice: SanctionNotice): Promise<void> {
    await this.collection.insertOne({ ...notice, recipient: ADMINISTRATORS_RECIPIENT, deliveredAt: null });
  }
}
