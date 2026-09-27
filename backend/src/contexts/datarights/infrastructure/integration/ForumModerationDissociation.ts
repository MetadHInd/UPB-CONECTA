import type { Collection, Db } from 'mongodb';
import type { InfractionRepositoryPort } from '../../../forum/domain/ports/out/InfractionRepositoryPort.js';
import type { SanctionRepositoryPort } from '../../../forum/domain/ports/out/SanctionRepositoryPort.js';
import type { InMemorySanctionAuditLog } from '../../../forum/infrastructure/adapters/out/memory/InMemorySanctionAuditLog.js';
import { MongoForumAccessAuditLog } from '../../../forum/infrastructure/adapters/out/mongo/MongoForumAccessAuditLog.js';
import { MongoInfractionRepository } from '../../../forum/infrastructure/adapters/out/mongo/MongoInfractionRepository.js';
import { MongoSanctionAuditLog } from '../../../forum/infrastructure/adapters/out/mongo/MongoSanctionAuditLog.js';
import { MongoSanctionNoticeOutbox } from '../../../forum/infrastructure/adapters/out/mongo/MongoSanctionNoticeOutbox.js';
import { MongoSanctionRepository } from '../../../forum/infrastructure/adapters/out/mongo/MongoSanctionRepository.js';
import type { ModerationRecordDissociationPort } from '../../domain/ports/out/ModerationRecordDissociationPort.js';

/**
 * Disociacion del registro de moderacion del foro (HU-48 criterio 5) sobre los
 * repositorios en memoria. Conserva todo lo que sustenta una sancion (contenido,
 * norma incumplida, niveles, fechas, quien la impuso o revoco) y reemplaza
 * unicamente el correo del titular por el seudonimo.
 */
export class InMemoryForumModerationDissociation implements ModerationRecordDissociationPort {
  constructor(
    private readonly stores: {
      readonly infractions: InfractionRepositoryPort;
      readonly sanctions: SanctionRepositoryPort;
      readonly sanctionAudit: InMemorySanctionAuditLog;
    }
  ) {}

  async dissociate(subject: string, pseudonym: string): Promise<number> {
    const { infractions, sanctions, sanctionAudit } = this.stores;
    let changed = 0;
    for (const infraction of await infractions.findByStudent(subject)) {
      await infractions.update({ ...infraction, studentEmail: pseudonym });
      changed += 1;
    }
    for (const sanction of await sanctions.findSanctions(subject)) {
      await sanctions.update({ ...sanction, studentEmail: pseudonym });
      changed += 1;
    }
    return changed + sanctionAudit.dissociateStudent(subject, pseudonym);
  }
}

interface EmailKeyed {
  studentEmail: string;
}

/**
 * Misma disociacion sobre MongoDB. `updateMany` con el correo como valor de
 * igualdad: el registro sigue existiendo, solo cambia quien figura en el. Cubre
 * tambien la bandeja de avisos (`studentEmail` y `recipient`) y el registro de
 * accesos denegados, que llevan el correo del titular.
 */
export class MongoForumModerationDissociation implements ModerationRecordDissociationPort {
  private readonly emailKeyed: readonly Collection<EmailKeyed>[];
  private readonly notices: Collection<EmailKeyed & { recipient: string }>;

  constructor(
    db: Db,
    collections: {
      readonly infractions?: string;
      readonly sanctions?: string;
      readonly sanctionAudit?: string;
      readonly accessAudit?: string;
      readonly notices?: string;
    } = {}
  ) {
    this.emailKeyed = [
      db.collection<EmailKeyed>(collections.infractions ?? MongoInfractionRepository.COLLECTION),
      db.collection<EmailKeyed>(collections.sanctions ?? MongoSanctionRepository.COLLECTION),
      db.collection<EmailKeyed>(collections.sanctionAudit ?? MongoSanctionAuditLog.COLLECTION),
      db.collection<EmailKeyed>(collections.accessAudit ?? MongoForumAccessAuditLog.COLLECTION)
    ];
    this.notices = db.collection(collections.notices ?? MongoSanctionNoticeOutbox.COLLECTION);
  }

  async dissociate(subject: string, pseudonym: string): Promise<number> {
    let changed = 0;
    for (const collection of this.emailKeyed) {
      const result = await collection.updateMany({ studentEmail: { $eq: subject } }, { $set: { studentEmail: pseudonym } });
      changed += result.modifiedCount;
    }
    // Aviso al estudiante: el correo es tambien el destinatario. Aviso a
    // administradores: el destinatario es `content-admins` y no se toca.
    const toStudent = await this.notices.updateMany(
      { studentEmail: { $eq: subject }, recipient: { $eq: subject } },
      { $set: { studentEmail: pseudonym, recipient: pseudonym } }
    );
    const toAdmins = await this.notices.updateMany({ studentEmail: { $eq: subject } }, { $set: { studentEmail: pseudonym } });
    return changed + toStudent.modifiedCount + toAdmins.modifiedCount;
  }
}
