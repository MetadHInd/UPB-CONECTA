import { MessageId } from '../../domain/value-objects/MessageId.js';
import type { RawInstitutionalMessage } from '../../domain/entities/RawInstitutionalMessage.js';

/**
 * Corpus de 19 correos institucionales anonimizados (Definicion de Terminado
 * de HU-02): cada `rawBody` es el origen MIME completo (encabezados + cuerpo)
 * tal como lo entregaria `envelope.source`, no un fragmento de HTML como el
 * corpus de HU-01. Cubre texto plano, HTML con enlaces, multiparte
 * (alternative y mixed con adjuntos), cadenas de reenvio, firma/aviso legal,
 * y las variantes de codificacion que exige el criterio 4: iso-8859-1,
 * windows-1252, quoted-printable, base64 y UTF-8 mal etiquetado (mojibake).
 */
export function buildRawMessageNormalizationFixtures(): RawInstitutionalMessage[] {
  return [
    // 1. Texto plano simple, US-ASCII.
    build(201, 'semillero-ia-2026-20', 'investigacion@upb.edu.co', 'Convocatoria semillero de investigacion 2026-20', '2026-08-10T14:15:00Z', `From: Facultad de Ingenierias <investigacion@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Convocatoria semillero de investigacion 2026-20
Date: Mon, 10 Aug 2026 09:15:00 -0500
Content-Type: text/plain; charset=us-ascii

Se abre la convocatoria del semillero de investigacion en IA.
Postulaciones hasta el 25 de agosto de 2026.`),

    // 2. HTML sin alternativa en texto plano, con un enlace.
    build(202, 'practica-banco-digital', 'practicas.ingenierias@upb.edu.co', 'Nueva oferta de practica en banco digital', '2026-08-11T15:00:00Z', `From: Coordinacion de Practicas <practicas.ingenierias@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Nueva oferta de practica en banco digital
Date: Tue, 11 Aug 2026 10:00:00 -0500
Content-Type: text/html; charset=utf-8

<html><body><p>Postula a la practica en <a href="https://practicas.upb.edu.co/oferta/482">este enlace</a> antes del 30 de agosto.</p></body></html>`),

    // 3. HTML con multiples enlaces y etiquetas anidadas.
    build(203, 'cronograma-reglamento', 'registro@upb.edu.co', 'Cronograma y reglamento del semestre', '2026-08-12T13:00:00Z', `From: Registro Academico <registro@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Cronograma y reglamento del semestre
Date: Wed, 12 Aug 2026 08:00:00 -0500
Content-Type: text/html; charset=utf-8

<html><body>
<p>Consulta el <strong>cronograma</strong> aqui: <a href="https://upb.edu.co/cronograma">cronograma</a></p>
<p>Y el reglamento en <a href="https://upb.edu.co/reglamento">este otro enlace</a>.</p>
</body></html>`),

    // 4. Multipart/alternative (texto plano + HTML): debe preferir el plano.
    build(204, 'inscripcion-taller-cv', 'bienestar@upb.edu.co', 'Taller de hojas de vida', '2026-08-13T14:00:00Z', `From: Bienestar Universitario <bienestar@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Taller de hojas de vida
Date: Thu, 13 Aug 2026 09:00:00 -0500
Content-Type: multipart/alternative; boundary="ALT-001"

--ALT-001
Content-Type: text/plain; charset=utf-8

Version en texto plano: la inscripcion cierra el 18 de agosto.
--ALT-001
Content-Type: text/html; charset=utf-8

<html><body><p>Version en <b>HTML</b>: la inscripcion cierra el 18 de agosto.</p></body></html>
--ALT-001--`),

    // 5. Firma institucional (delimitador "-- ") que debe eliminarse.
    build(205, 'taller-cv-firma', 'bienestar@upb.edu.co', 'Recordatorio taller de hojas de vida', '2026-08-14T14:00:00Z', `From: Bienestar Universitario <bienestar@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Recordatorio taller de hojas de vida
Date: Fri, 14 Aug 2026 09:00:00 -0500
Content-Type: text/plain; charset=utf-8

Recuerda inscribirte al taller de hojas de vida antes del 22 de agosto.

--
Bienestar Universitario
UPB Seccional Bucaramanga
Tel. (607) 6796220`),

    // 6. Aviso legal que debe eliminarse.
    build(206, 'matriculas-aviso-legal', 'admisiones@upb.edu.co', 'Apertura de matriculas segundo semestre', '2026-08-15T13:30:00Z', `From: Admisiones <admisiones@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Apertura de matriculas segundo semestre
Date: Sat, 15 Aug 2026 08:30:00 -0500
Content-Type: text/plain; charset=utf-8

La universidad informa apertura de matriculas para el segundo semestre.

Aviso legal: Este mensaje y sus anexos son confidenciales y de uso exclusivo del destinatario.`),

    // 7. Cadena de reenvio con encabezado "-----Mensaje original-----".
    build(207, 'reenvio-beca-excelencia', 'coordinacion.docentes@upb.edu.co', 'RV: Convocatoria beca excelencia academica', '2026-08-16T13:10:00Z', `From: Coordinacion Academica <coordinacion.docentes@upb.edu.co>
To: docentes@upb.edu.co
Subject: RV: Convocatoria beca excelencia academica
Date: Sun, 16 Aug 2026 08:10:00 -0500
Content-Type: text/plain; charset=utf-8

Reenvio la convocatoria de la coordinacion, revisen el adjunto.

-----Mensaje original-----
De: coordinacion@upb.edu.co
Enviado: viernes, 7 de agosto de 2026 08:00
Para: docentes@upb.edu.co
Asunto: Convocatoria beca excelencia academica

Contenido original del mensaje reenviado que no debe llegar al clasificador.`),

    // 8. charset=iso-8859-1 bien declarado, caracteres acentuados correctos.
    build(208, 'idiomas-iso-8859-1', 'idiomas@upb.edu.co', 'Cursos de idiomas: cronograma comun', '2026-08-17T13:00:00Z', `From: Idiomas <idiomas@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Cursos de idiomas: cronograma comun
Date: Mon, 17 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=iso-8859-1

La inscripción a los cursos de idiomas está disponible según el cronograma común. Aplica también para posgrados.`),

    // 9. charset=windows-1252 declarado explicitamente.
    build(209, 'decano-windows-1252', 'decanatura.sistemas@upb.edu.co', 'Nuevas modalidades de practica', '2026-08-18T13:00:00Z', `From: Decanatura Ingenieria de Sistemas <decanatura.sistemas@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Nuevas modalidades de practica
Date: Tue, 18 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=windows-1252

¿Ya te inscribiste? El decano confirmó nuevas modalidades de práctica para este período académico.`),

    // 10. Sin charset declarado: los octetos son UTF-8 valido y se recuperan por defecto.
    build(210, 'portal-sin-charset', 'registro@upb.edu.co', 'Actualizacion del portal academico', '2026-08-19T13:00:00Z', `From: Registro Academico <registro@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Actualizacion del portal academico
Date: Wed, 19 Aug 2026 08:00:00 -0500
Content-Type: text/plain

Confirmamos la inscripciÃ³n para el prÃ³ximo semestre acadÃ©mico. Revisa la informaciÃ³n en el portal.`),

    // 11. Content-Transfer-Encoding: quoted-printable, con acentos codificados.
    build(211, 'movilidad-quoted-printable', 'internacionalizacion@upb.edu.co', 'Reunion informativa de movilidad academica', '2026-08-20T13:00:00Z', `From: Internacionalizacion <internacionalizacion@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Reunion informativa de movilidad academica
Date: Thu, 20 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

La reuni=C3=B3n informativa sobre movilidad acad=C3=A9mica ser=C3=A1 el 20 de agosto.`),

    // 12. Content-Transfer-Encoding: base64.
    build(212, 'diplomado-base64', 'educacion.continua@upb.edu.co', 'Diplomado en analitica de datos', '2026-08-21T13:00:00Z', `From: Educacion Continua <educacion.continua@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Diplomado en analitica de datos
Date: Fri, 21 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64

TGFzIGluc2NyaXBjaW9uZXMgcGFyYSBlbCBkaXBsb21hZG8gY2llcnJhbiBlbCAyOCBkZSBhZ29zdG8gZGUgMjAyNi4=`),

    // 13. multipart/mixed con adjunto (Content-Disposition + filename): metadato, no interrumpe.
    build(213, 'evento-emprendimiento-adjunto', 'emprendimiento@upb.edu.co', 'Formulario evento de emprendimiento', '2026-08-22T13:00:00Z', `From: Centro de Emprendimiento <emprendimiento@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Formulario evento de emprendimiento
Date: Sat, 22 Aug 2026 08:00:00 -0500
Content-Type: multipart/mixed; boundary="MIX-001"

--MIX-001
Content-Type: text/plain; charset=utf-8

Adjunto el formulario de inscripcion al evento de emprendimiento.

--MIX-001
Content-Type: application/pdf; name="formulario.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="formulario.pdf"

Rm9ybXVsYXJpbyBkZSBpbnNjcmlwY2lvbiBQREYgZGUgcHJ1ZWJhLCBjb250ZW5pZG8gaXJyZWxldmFudGUgcGFyYSBlbCB0ZXN0Lg==
--MIX-001--`),

    // 14. Adjunto sin parametro filename (solo Content-Disposition: attachment).
    build(214, 'adjunto-sin-nombre', 'soporte.ti@upb.edu.co', 'Archivo adjunto de soporte', '2026-08-23T13:00:00Z', `From: Soporte TI <soporte.ti@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Archivo adjunto de soporte
Date: Sun, 23 Aug 2026 08:00:00 -0500
Content-Type: multipart/mixed; boundary="MIX-002"

--MIX-002
Content-Type: text/plain; charset=utf-8

Revisa el archivo adjunto para configurar tu acceso.

--MIX-002
Content-Type: application/octet-stream
Content-Transfer-Encoding: base64
Content-Disposition: attachment

QWRqdW50byBzaW4gbm9tYnJlIGRlIGFyY2hpdm8gZGVjbGFyYWRvLCBjb250ZW5pZG8gaXJyZWxldmFudGUu
--MIX-002--`),

    // 15. Caso combinado: multipart/mixed que contiene multipart/alternative + adjunto.
    build(215, 'pasantia-internacional-completa', 'internacionalizacion@upb.edu.co', 'Convocatoria pasantia internacional', '2026-08-24T13:00:00Z', `From: Internacionalizacion <internacionalizacion@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Convocatoria pasantia internacional
Date: Mon, 24 Aug 2026 08:00:00 -0500
Content-Type: multipart/mixed; boundary="MIX-003"

--MIX-003
Content-Type: multipart/alternative; boundary="ALT-003"

--ALT-003
Content-Type: text/plain; charset=utf-8

Version texto plano: convocatoria de pasantia internacional, cierre 5 de septiembre.
--ALT-003
Content-Type: text/html; charset=utf-8

<html><body><p>Version HTML: revisa los <a href="https://upb.edu.co/pasantias">requisitos aqui</a>.</p></body></html>
--ALT-003--

--MIX-003
Content-Type: application/pdf; name="requisitos.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="requisitos.pdf"

UmVxdWlzaXRvcyBkZSBwYXNhbnRpYSBQREYgZGUgcHJ1ZWJhLCBjb250ZW5pZG8gaXJyZWxldmFudGUu
--MIX-003--`),

    // 16. Destinatarios declarados: To con nombre visible + Cc.
    build(216, 'actualizacion-datos-contacto', 'registro@upb.edu.co', 'Recordatorio actualizacion de datos', '2026-08-12T13:30:00Z', `From: Registro Academico <registro@upb.edu.co>
To: "Juan Perez" <juan.perez@upb.edu.co>, maria.gomez@upb.edu.co
Cc: coordinacion.sistemas@upb.edu.co
Subject: Recordatorio actualizacion de datos
Date: Wed, 12 Aug 2026 08:30:00 -0500
Content-Type: text/plain; charset=utf-8

Actualiza tus datos de contacto antes del 15 de agosto.`),

    // 17. Asunto codificado RFC 2047 (=?UTF-8?B?...?=) con caracteres acentuados.
    build(217, 'asunto-codificado-rfc2047', 'admisiones@upb.edu.co', 'Convocatoria: Inscripcion abierta', '2026-08-25T13:00:00Z', `From: Admisiones <admisiones@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: =?UTF-8?B?Q29udm9jYXRvcmlhOiBJbnNjcmlwY2nDs24gYWJpZXJ0YQ==?=
Date: Tue, 25 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=utf-8

Ya esta disponible la inscripcion para el proximo semestre.`),

    // 18. Reenvio estilo "escribio:" con cita del mensaje original a eliminar.
    build(218, 'reenvio-evento-bienestar', 'bienestar@upb.edu.co', 'RE: Enlace del evento de bienestar', '2026-08-26T13:00:00Z', `From: Bienestar Universitario <bienestar@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: RE: Enlace del evento de bienestar
Date: Wed, 26 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=utf-8

Aqui esta la informacion que pediste sobre el evento de bienestar.

El 5 de agosto de 2026, Ana Torres <ana.torres@upb.edu.co> escribio:
> Podrias reenviarme el enlace del evento de bienestar de esta semana?
> Gracias de antemano.`),

    // 19. charset declarado incorrectamente (iso-8859-1 sobre octetos UTF-8 reales):
    // iso-8859-1 nunca falla al decodificar, asi que produce mojibake que debe
    // repararse en un segundo paso. Este es el caso que ejercita repairMojibake,
    // a diferencia del fixture 10 (sin charset, se recupera en el primer intento).
    build(219, 'comite-charset-incorrecto', 'planeacion@upb.edu.co', 'Programacion del proximo semestre', '2026-08-27T13:00:00Z', `From: Planeacion Academica <planeacion@upb.edu.co>
To: estudiantes-sistemas@upb.edu.co
Subject: Programacion del proximo semestre
Date: Thu, 27 Aug 2026 08:00:00 -0500
Content-Type: text/plain; charset=iso-8859-1

El comitÃ© confirmÃ³ la programaciÃ³n del prÃ³ximo semestre.`)
  ];
}

function build(
  mailboxUid: number,
  messageIdLocalPart: string,
  sender: string,
  subject: string,
  receivedAtIso: string,
  rawBody: string
): RawInstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(`<${messageIdLocalPart}@upb.edu.co>`),
    mailboxUid,
    sender,
    subject,
    receivedAt: new Date(receivedAtIso),
    rawBody
  };
}
