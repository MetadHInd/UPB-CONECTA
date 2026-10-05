import { describe, expect, it } from 'vitest';
import { decidePublicationNotification } from '../../src/contexts/classification/domain/services/PublicationNotificationPolicy.js';

describe('Politica de reenvios — decidePublicationNotification (politica de dominio pura)', () => {
  it('primera clasificacion del grupo publicada: programa notificaciones', () => {
    expect(decidePublicationNotification(null, 'published')).toBe('schedule-notifications');
  });

  it('primera clasificacion del grupo en revision: alerta al administrador', () => {
    expect(decidePublicationNotification(null, 'pending-review')).toBe('alert-admin');
  });

  it('reenvio sin cambio de estado: no notifica ni alerta de nuevo', () => {
    expect(decidePublicationNotification('published', 'published')).toBe('none');
    expect(decidePublicationNotification('pending-review', 'pending-review')).toBe('none');
  });

  it('reenvio que pasa de revision pendiente a publicado: programa notificaciones', () => {
    expect(decidePublicationNotification('pending-review', 'published')).toBe('schedule-notifications');
  });

  it('reenvio que pasa de publicado a revision pendiente: alerta al administrador', () => {
    expect(decidePublicationNotification('published', 'pending-review')).toBe('alert-admin');
  });
});
