import { describe, expect, it } from 'vitest';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { PracticeConvocatoriaSnapshot } from '../../src/contexts/practices/domain/ports/out/PracticeConvocatoriaSourcePort.js';
import {
  canonicalApplicationChannel,
  findDuplicateOffer,
  normalizeCompanyName
} from '../../src/contexts/practices/domain/services/PracticeDuplicatePolicy.js';
import { loadPracticeListingPolicy } from '../../src/contexts/practices/infrastructure/config/PracticeListingPolicyConfig.js';

const rules = loadPracticeListingPolicy();

function snapshot(id: string, overrides: { link?: string | null; company?: string; due?: Date; withdrawnAt?: Date | null; firstSentAt?: Date } = {}): PracticeConvocatoriaSnapshot {
  return {
    messageId: id,
    category: MessageCategory.PRACTICA,
    publicationStatus: 'published',
    targeting: { kind: 'all-community' },
    record: {
      sender: 's',
      subject: id,
      body: 'b',
      representativeMessageId: id,
      firstSentAt: overrides.firstSentAt ?? new Date('2026-09-01T00:00:00Z'),
      lastSentAt: new Date('2026-09-01T00:00:00Z'),
      resendCount: 0,
      dueDate: { kind: 'con-fecha', date: overrides.due ?? new Date('2026-10-30T22:00:00Z') },
      applicationLink: overrides.link === undefined ? null : overrides.link,
      withdrawnAt: overrides.withdrawnAt ?? null
    },
    details:
      overrides.company === undefined
        ? null
        : {
            messageId: id,
            convocatoriaId: { sender: 's', subject: id, firstSentAt: new Date('2026-09-01T00:00:00Z') },
            company: overrides.company,
            requirements: 'r',
            modality: 'remota' as never,
            createdBy: 'a',
            createdAt: new Date(),
            updatedBy: 'a',
            updatedAt: new Date(),
            withdrawnAt: null
          }
  };
}

describe('canonicalApplicationChannel', () => {
  it.each([
    ['https://Practicas.UPB.edu.co/oferta/482/', 'https://practicas.upb.edu.co/oferta/482'],
    ['https://practicas.upb.edu.co/oferta/482?utm_source=x&utm_medium=y', 'https://practicas.upb.edu.co/oferta/482'],
    ['https://practicas.upb.edu.co/oferta/482#form', 'https://practicas.upb.edu.co/oferta/482'],
    ['https://a.co/p?b=2&a=1&fbclid=z', 'https://a.co/p?a=1&b=2'],
    ['http://a.co:80/p', 'http://a.co/p'],
    ['HTTPS://A.CO', 'https://a.co/'],
    ['mailto:Practicas@Empresa.co', 'mailto:practicas@empresa.co'],
    ['practicas@empresa.co', 'mailto:practicas@empresa.co']
  ])('%s -> %s', (input, expected) => {
    expect(canonicalApplicationChannel(input, rules)).toBe(expected);
  });

  it('devuelve null si no hay canal o no se puede interpretar', () => {
    expect(canonicalApplicationChannel(null, rules)).toBeNull();
    expect(canonicalApplicationChannel('   ', rules)).toBeNull();
    expect(canonicalApplicationChannel('no es un enlace', rules)).toBeNull();
  });
});

describe('normalizeCompanyName', () => {
  it('ignora mayúsculas, tildes, puntuación y sufijos legales', () => {
    expect(normalizeCompanyName('Sura S.A.S.', rules)).toBe('sura');
    expect(normalizeCompanyName('  sura  sas', rules)).toBe('sura');
    expect(normalizeCompanyName('Cafetería Ñandú Ltda', rules)).toBe('cafeteria nandu');
  });
});

describe('findDuplicateOffer', () => {
  const candidate = { company: 'Sura S.A.S.', applicationChannel: 'https://sura.example.com/p', dueDate: new Date('2026-10-30T22:00:00Z') };

  it('encuentra por canal de postulación canónico', () => {
    const found = findDuplicateOffer({ ...candidate, applicationChannel: 'https://SURA.example.com/p/?utm_campaign=x' }, [snapshot('a', { link: 'https://sura.example.com/p' })], rules);
    expect(found?.messageId).toBe('a');
  });

  it('encuentra por empresa y cierre en la misma ventana cuando el canal difiere', () => {
    const found = findDuplicateOffer(candidate, [snapshot('a', { link: 'https://otro.example.com', company: 'sura sas', due: new Date('2026-10-30T10:00:00Z') })], rules);
    expect(found?.messageId).toBe('a');
  });

  it('no coincide si el cierre queda fuera de la ventana, o si la ingerida no tiene empresa', () => {
    expect(findDuplicateOffer(candidate, [snapshot('a', { company: 'Sura', due: new Date('2026-11-05T00:00:00Z') })], rules)).toBeNull();
    expect(findDuplicateOffer(candidate, [snapshot('b', { link: null })], rules)).toBeNull();
  });

  it('una oferta sin fecha de cierre no coincide por empresa y fecha', () => {
    const open = snapshot('a', { company: 'Sura' });
    const withoutDate = { ...open, record: { ...open.record, dueDate: { kind: 'sin-vencimiento' as const } } };
    expect(findDuplicateOffer(candidate, [withoutDate], rules)).toBeNull();
  });

  it('ignora las retiradas y prefiere el canal sobre la empresa, y la más antigua entre iguales', () => {
    const byCompany = snapshot('empresa', { company: 'Sura', firstSentAt: new Date('2026-08-01T00:00:00Z') });
    const byChannelNew = snapshot('canal-nuevo', { link: 'https://sura.example.com/p', firstSentAt: new Date('2026-09-05T00:00:00Z') });
    const byChannelOld = snapshot('canal-viejo', { link: 'https://sura.example.com/p', firstSentAt: new Date('2026-09-02T00:00:00Z') });
    const withdrawn = snapshot('retirada', { link: 'https://sura.example.com/p', withdrawnAt: new Date('2026-09-10T00:00:00Z') });

    expect(findDuplicateOffer(candidate, [withdrawn, byCompany, byChannelNew, byChannelOld], rules)?.messageId).toBe('canal-viejo');
    expect(findDuplicateOffer(candidate, [withdrawn, byCompany], rules)?.messageId).toBe('empresa');
    expect(findDuplicateOffer(candidate, [withdrawn], rules)).toBeNull();
  });
});
