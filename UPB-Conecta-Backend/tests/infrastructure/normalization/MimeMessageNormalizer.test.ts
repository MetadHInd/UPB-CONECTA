import { describe, it, expect } from 'vitest';
import { normalizeInstitutionalMessage } from '../../../src/contexts/ingestion/infrastructure/normalization/MimeMessageNormalizer.js';
import { buildRawMessageNormalizationFixtures } from '../../../src/contexts/ingestion/infrastructure/fixtures/institutionalMessageSources.js';
import type { RawInstitutionalMessage } from '../../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';

const fixtures = buildRawMessageNormalizationFixtures();

function byUid(mailboxUid: number): RawInstitutionalMessage {
  const found = fixtures.find((fixture) => fixture.mailboxUid === mailboxUid);
  if (!found) throw new Error(`Fixture con mailboxUid ${mailboxUid} no encontrado`);
  return found;
}

describe('MimeMessageNormalizer (HU-02)', () => {
  it('Definicion de terminado: el corpus tiene al menos 15 correos institucionales anonimizados', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  describe('criterio 1: extrae remitente, asunto, cuerpo, fecha de envio y destinatarios', () => {
    it('puebla InstitutionalMessage con los metadatos declarados en el correo', () => {
      const msg = normalizeInstitutionalMessage(byUid(216));

      expect(msg.sender).toBe('registro@upb.edu.co');
      expect(msg.subject).toBe('Recordatorio actualizacion de datos');
      expect(msg.body).toContain('Actualiza tus datos de contacto antes del 15 de agosto.');
      expect(msg.sentAt.toISOString()).toBe('2026-08-12T13:30:00.000Z');
      expect(msg.recipients).toHaveLength(3);
      expect(msg.recipients).toEqual(
        expect.arrayContaining(['juan.perez@upb.edu.co', 'maria.gomez@upb.edu.co', 'coordinacion.sistemas@upb.edu.co'])
      );
    });

    it('conserva la identidad del mensaje original (messageId, mailboxUid)', () => {
      const raw = byUid(201);
      const msg = normalizeInstitutionalMessage(raw);

      expect(msg.messageId.equals(raw.messageId)).toBe(true);
      expect(msg.mailboxUid).toBe(201);
    });

    it('decodifica un asunto codificado en RFC 2047', () => {
      const msg = normalizeInstitutionalMessage(byUid(217));
      expect(msg.subject).toBe('Convocatoria: Inscripción abierta');
    });
  });

  describe('criterio 2: normaliza HTML a texto plano legible conservando los enlaces', () => {
    it('convierte un cuerpo HTML sin alternativa, sin dejar etiquetas y con el enlace conservado', () => {
      const msg = normalizeInstitutionalMessage(byUid(202));

      expect(msg.body).not.toMatch(/<[^>]+>/);
      expect(msg.body).toContain('este enlace (https://practicas.upb.edu.co/oferta/482)');
    });

    it('conserva todas las direcciones web de un HTML con multiples enlaces', () => {
      const msg = normalizeInstitutionalMessage(byUid(203));

      expect(msg.body).toContain('https://upb.edu.co/cronograma');
      expect(msg.body).toContain('https://upb.edu.co/reglamento');
      expect(msg.body).not.toMatch(/<[^>]+>/);
    });

    it('prefiere la parte text/plain cuando el mensaje es multipart/alternative', () => {
      const msg = normalizeInstitutionalMessage(byUid(204));
      expect(msg.body).toBe('Version en texto plano: la inscripcion cierra el 18 de agosto.');
    });
  });

  describe('criterio 3: elimina firma institucional, aviso legal y cadena de reenvio', () => {
    it('elimina el bloque de firma tras el delimitador "-- "', () => {
      const msg = normalizeInstitutionalMessage(byUid(205));

      expect(msg.body).toBe('Recuerda inscribirte al taller de hojas de vida antes del 22 de agosto.');
      expect(msg.body).not.toContain('Bienestar Universitario');
      expect(msg.body).not.toContain('Tel.');
    });

    it('elimina el aviso legal', () => {
      const msg = normalizeInstitutionalMessage(byUid(206));

      expect(msg.body).toBe('La universidad informa apertura de matriculas para el segundo semestre.');
      expect(msg.body).not.toContain('Aviso legal');
    });

    it('elimina la cadena de reenvio con encabezado "-----Mensaje original-----"', () => {
      const msg = normalizeInstitutionalMessage(byUid(207));

      expect(msg.body).toBe('Reenvio la convocatoria de la coordinacion, revisen el adjunto.');
      expect(msg.body).not.toContain('Contenido original del mensaje reenviado');
    });

    it('elimina la cita de un reenvio estilo "... escribio:"', () => {
      const msg = normalizeInstitutionalMessage(byUid(218));

      expect(msg.body).toBe('Aqui esta la informacion que pediste sobre el evento de bienestar.');
      expect(msg.body).not.toContain('Podrias reenviarme');
    });
  });

  describe('criterio 4: codificacion no UTF-8 o caracteres acentuados mal codificados', () => {
    it('decodifica correctamente un cuerpo declarado charset=iso-8859-1', () => {
      const msg = normalizeInstitutionalMessage(byUid(208));

      expect(msg.body).toBe(
        'La inscripción a los cursos de idiomas está disponible según el cronograma común. Aplica también para posgrados.'
      );
      expect(msg.body).not.toMatch(/[ÃÂ]|�/);
    });

    it('decodifica correctamente un cuerpo declarado charset=windows-1252', () => {
      const msg = normalizeInstitutionalMessage(byUid(209));

      expect(msg.body).toBe(
        '¿Ya te inscribiste? El decano confirmó nuevas modalidades de práctica para este período académico.'
      );
      expect(msg.body).not.toMatch(/[ÃÂ]|�/);
    });

    it('sin charset declarado, recupera texto UTF-8 valido', () => {
      const msg = normalizeInstitutionalMessage(byUid(210));

      expect(msg.body).toBe(
        'Confirmamos la inscripción para el próximo semestre académico. Revisa la información en el portal.'
      );
    });

    it('repara caracteres acentuados mal codificados (charset declarado incorrectamente)', () => {
      const msg = normalizeInstitutionalMessage(byUid(219));

      expect(msg.body).toBe('El comité confirmó la programación del próximo semestre.');
      expect(msg.body).not.toMatch(/Ã/);
    });

    it('decodifica un cuerpo con Content-Transfer-Encoding: quoted-printable', () => {
      const msg = normalizeInstitutionalMessage(byUid(211));
      expect(msg.body).toBe('La reunión informativa sobre movilidad académica será el 20 de agosto.');
    });

    it('decodifica un cuerpo con Content-Transfer-Encoding: base64', () => {
      const msg = normalizeInstitutionalMessage(byUid(212));
      expect(msg.body).toBe('Las inscripciones para el diplomado cierran el 28 de agosto de 2026.');
    });
  });

  describe('criterio 5: los adjuntos no interrumpen el procesamiento y quedan como metadato', () => {
    it('registra un adjunto con nombre de archivo sin mezclarlo con el cuerpo', () => {
      const msg = normalizeInstitutionalMessage(byUid(213));

      expect(msg.body).toBe('Adjunto el formulario de inscripcion al evento de emprendimiento.');
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments[0]).toMatchObject({ filename: 'formulario.pdf', contentType: 'application/pdf' });
      expect(msg.attachments[0]?.approxSizeBytes).toBeGreaterThan(0);
    });

    it('registra un adjunto sin nombre de archivo declarado sin fallar', () => {
      const raw = byUid(214);
      expect(() => normalizeInstitutionalMessage(raw)).not.toThrow();

      const msg = normalizeInstitutionalMessage(raw);
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments[0]?.filename).toBeNull();
      expect(msg.body).toContain('Revisa el archivo adjunto para configurar tu acceso.');
    });

    it('procesa un multipart/mixed con alternativa HTML/plano anidada y adjunto, sin interrupcion', () => {
      const msg = normalizeInstitutionalMessage(byUid(215));

      expect(msg.body).toBe('Version texto plano: convocatoria de pasantia internacional, cierre 5 de septiembre.');
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments[0]).toMatchObject({ filename: 'requisitos.pdf', contentType: 'application/pdf' });
    });
  });
});
