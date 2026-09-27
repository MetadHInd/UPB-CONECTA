import { describe, expect, it } from 'vitest';
import { InfractionOutcome, type Infraction } from '../../src/contexts/forum/domain/entities/Infraction.js';
import {
  activeSanctionEnd,
  isSanctionActive,
  revokeSanction,
  sanctionStatus,
  SanctionLevel,
  type SanctionRecord
} from '../../src/contexts/forum/domain/entities/Sanction.js';
import { SanctionPolicy, transition } from '../../src/contexts/forum/domain/services/SanctionPolicy.js';
import { InvalidSanctionThresholdsError, SanctionThresholds } from '../../src/contexts/forum/domain/value-objects/SanctionThresholds.js';

const NOW = new Date('2026-09-26T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const infraction = (n: number, overrides: Partial<Infraction> = {}): Infraction => ({
  id: `post:${n}`,
  studentEmail: 'ana@upb.edu.co',
  content: { kind: 'post', id: String(n), topicId: 'general', title: 'Título', text: 'Texto' },
  outcome: InfractionOutcome.BLOCKED,
  reason: 'Lenguaje ofensivo',
  detectedBy: 'automatic-moderation',
  occurredAt: daysAgo(1),
  ...overrides
});

const sanction = (overrides: Partial<SanctionRecord> = {}): SanctionRecord => ({
  id: 's1',
  studentEmail: 'ana@upb.edu.co',
  level: SanctionLevel.TEMPORARY_SUSPENSION,
  reason: 'Motivo',
  startsAt: daysAgo(1),
  endsAt: new Date(NOW.getTime() + 6 * DAY),
  revokedAt: null,
  infractionCount: 3,
  triggeredByInfractionId: 'post:3',
  imposedAt: daysAgo(1),
  revocation: null,
  ...overrides
});

const policy = new SanctionPolicy(SanctionThresholds.default());

function decideFor(count: number, extra: { sanctions?: SanctionRecord[]; policy?: SanctionPolicy } = {}) {
  const infractions = Array.from({ length: count }, (_, i) => infraction(i + 1));
  return (extra.policy ?? policy).decide({ trigger: infractions[count - 1]!, infractions, sanctions: extra.sanctions ?? [], now: NOW });
}

describe('HU-35 — SanctionPolicy (servicio de dominio con estados y transiciones explícitas)', () => {
  describe('criterio 1 — gradualidad por umbral (por defecto 1, 3 y 5)', () => {
    it.each([
      [1, SanctionLevel.WARNING, 0],
      [3, SanctionLevel.TEMPORARY_SUSPENSION, 7],
      [5, SanctionLevel.EXTENDED_SUSPENSION, 30],
      [6, SanctionLevel.EXTENDED_SUSPENSION, 30],
      [9, SanctionLevel.EXTENDED_SUSPENSION, 30]
    ])('con %i infracciones aplica %s por %i días', (count, level, days) => {
      const decision = decideFor(count);

      expect(decision).toMatchObject({ level, infractionCount: count, startsAt: NOW });
      expect(decision!.endsAt.getTime() - NOW.getTime()).toBe(days * DAY);
    });

    it.each([2, 4])('con %i infracciones no hay sanción nueva: sigue en el escalón que ya recibió', (count) => {
      expect(decideFor(count)).toBeNull();
    });

    it('el motivo explica el nivel, el conteo, la ventana y la última infracción', () => {
      expect(decideFor(3)!.reason).toBe(
        'Suspensión temporal de la facultad de publicar por 3 infracciones a las normas de convivencia en los últimos 180 días. Última infracción: Lenguaje ofensivo'
      );
      expect(decideFor(1)!.reason).toContain('por 1 infracción a las normas');
    });

    it('las transiciones son explícitas: solo al cambiar de escalón, o reincidencia en el último', () => {
      expect(transition('none', 'none')).toBeNull();
      expect(transition('none', SanctionLevel.WARNING)).toBe(SanctionLevel.WARNING);
      expect(transition(SanctionLevel.WARNING, SanctionLevel.WARNING)).toBeNull();
      expect(transition(SanctionLevel.WARNING, SanctionLevel.TEMPORARY_SUSPENSION)).toBe(SanctionLevel.TEMPORARY_SUSPENSION);
      expect(transition(SanctionLevel.TEMPORARY_SUSPENSION, SanctionLevel.TEMPORARY_SUSPENSION)).toBeNull();
      expect(transition(SanctionLevel.TEMPORARY_SUSPENSION, SanctionLevel.EXTENDED_SUSPENSION)).toBe(SanctionLevel.EXTENDED_SUSPENSION);
      expect(transition(SanctionLevel.EXTENDED_SUSPENSION, SanctionLevel.EXTENDED_SUSPENSION)).toBe(SanctionLevel.EXTENDED_SUSPENSION);
      // Umbrales bajados por el administrador: se aplica el escalón alcanzado, no el siguiente.
      expect(transition('none', SanctionLevel.TEMPORARY_SUSPENSION)).toBe(SanctionLevel.TEMPORARY_SUSPENSION);
    });
  });

  describe('qué infracciones computan', () => {
    it('solo las bloqueadas: un contenido retenido sin decisión no sanciona', () => {
      const infractions = [infraction(1, { outcome: InfractionOutcome.RETAINED })];
      expect(policy.decide({ trigger: infractions[0]!, infractions, sanctions: [], now: NOW })).toBeNull();
      expect(policy.computableInfractions({ infractions, sanctions: [], now: NOW })).toHaveLength(0);
    });

    it('solo las de la ventana: una infracción de hace más de 180 días no escala', () => {
      const infractions = [infraction(1, { occurredAt: daysAgo(181) }), infraction(2, { occurredAt: daysAgo(180) }), infraction(3)];
      expect(policy.computableInfractions({ infractions, sanctions: [], now: NOW }).map((i) => i.id)).toEqual(['post:3']);
      expect(policy.decide({ trigger: infractions[2]!, infractions, sanctions: [], now: NOW })?.level).toBe(SanctionLevel.WARNING);
    });

    it('la infracción que disparó una sanción revocada deja de computar', () => {
      const infractions = [infraction(1), infraction(2), infraction(3)];
      const revoked = revokeSanction(sanction({ triggeredByInfractionId: 'post:3' }), {
        revokedBy: 'admin@upb.edu.co',
        reason: 'Improcedente',
        revokedAt: NOW
      });

      expect(policy.computableInfractions({ infractions, sanctions: [revoked], now: NOW }).map((i) => i.id)).toEqual(['post:1', 'post:2']);
      // Una nueva infracción vuelve a ser la tercera: suspensión temporal, no prolongada ni salto de escalón.
      const withNew = [...infractions, infraction(4)];
      expect(policy.decide({ trigger: withNew[3]!, infractions: withNew, sanctions: [revoked], now: NOW })?.level).toBe(
        SanctionLevel.TEMPORARY_SUSPENSION
      );
    });

    it('si el disparador no computa, no hay sanción aunque el resto sí', () => {
      const infractions = [infraction(1), infraction(2), infraction(3, { occurredAt: daysAgo(400) })];
      expect(policy.decide({ trigger: infractions[2]!, infractions, sanctions: [], now: NOW })).toBeNull();
    });
  });

  describe('criterio 7 — umbrales configurables', () => {
    it('con umbrales ajustados, la sanción sigue los nuevos valores', () => {
      const custom = new SanctionPolicy(
        SanctionThresholds.of({
          warningAt: 2,
          temporarySuspensionAt: 3,
          temporarySuspensionDays: 3,
          extendedSuspensionAt: 4,
          extendedSuspensionDays: 15,
          countingWindowDays: 90
        })
      );
      expect(decideFor(1, { policy: custom })).toBeNull();
      expect(decideFor(2, { policy: custom })?.level).toBe(SanctionLevel.WARNING);
      expect(decideFor(3, { policy: custom })!.endsAt.getTime() - NOW.getTime()).toBe(3 * DAY);
      expect(decideFor(4, { policy: custom })!.endsAt.getTime() - NOW.getTime()).toBe(15 * DAY);
    });

    it.each([
      [{ warningAt: 0 }, 'warningAt debe ser un entero positivo'],
      [{ temporarySuspensionDays: 1.5 }, 'temporarySuspensionDays debe ser un entero positivo'],
      [{ temporarySuspensionAt: 1 }, 'los niveles deben crecer'],
      [{ extendedSuspensionAt: 3 }, 'los niveles deben crecer'],
      [{ extendedSuspensionDays: 7 }, 'la suspension prolongada debe durar mas']
    ])('rechaza umbrales incoherentes %o', (change, message) => {
      expect(() => SanctionThresholds.of({ ...SanctionThresholds.default().values, ...change })).toThrow(InvalidSanctionThresholdsError);
      expect(() => SanctionThresholds.of({ ...SanctionThresholds.default().values, ...change })).toThrow(message);
    });
  });

  describe('vigencia de la sanción (criterios 3, 4 y 6)', () => {
    it('vigente en [inicio, fin): al vencer el plazo deja de estarlo sin intervención', () => {
      const s = sanction({ startsAt: NOW, endsAt: new Date(NOW.getTime() + DAY) });
      expect(isSanctionActive(s, NOW)).toBe(true);
      expect(isSanctionActive(s, new Date(NOW.getTime() + DAY - 1))).toBe(true);
      expect(isSanctionActive(s, new Date(NOW.getTime() + DAY))).toBe(false);
    });

    it('una advertencia nunca está vigente: no suspende', () => {
      expect(isSanctionActive(sanction({ level: SanctionLevel.WARNING, startsAt: NOW, endsAt: NOW }), NOW)).toBe(false);
    });

    it('revocada, deja de estar vigente desde el momento de la revocación', () => {
      const revoked = revokeSanction(sanction(), { revokedBy: 'admin@upb.edu.co', reason: 'x', revokedAt: NOW });
      expect(isSanctionActive(revoked, new Date(NOW.getTime() - 1))).toBe(true);
      expect(isSanctionActive(revoked, NOW)).toBe(false);
    });

    it('con varias vigentes, informa la que termina más tarde', () => {
      const later = new Date(NOW.getTime() + 30 * DAY);
      expect(activeSanctionEnd([sanction(), sanction({ id: 's2', endsAt: later })], NOW)).toEqual(later);
      expect(activeSanctionEnd([], NOW)).toBeNull();
    });

    it('estado para el historial: activa, cumplida, revocada o advertencia', () => {
      expect(sanctionStatus(sanction(), NOW)).toBe('active');
      expect(sanctionStatus(sanction({ endsAt: daysAgo(0.5) }), NOW)).toBe('served');
      expect(sanctionStatus(sanction({ level: SanctionLevel.WARNING, endsAt: daysAgo(1) }), NOW)).toBe('warning');
      expect(
        sanctionStatus(revokeSanction(sanction(), { revokedBy: 'admin@upb.edu.co', reason: 'x', revokedAt: NOW }), NOW)
      ).toBe('revoked');
    });
  });
});
