import type { SanctionNotice, SanctionNotificationPort } from '../../../../domain/ports/out/SanctionNotificationPort.js';

export class InMemorySanctionNotifications implements SanctionNotificationPort {
  readonly toStudents: SanctionNotice[] = [];
  readonly toAdministrators: SanctionNotice[] = [];

  async notifyStudent(notice: SanctionNotice): Promise<void> {
    this.toStudents.push(notice);
  }

  async notifyAdministrators(notice: SanctionNotice): Promise<void> {
    this.toAdministrators.push(notice);
  }
}
