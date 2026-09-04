# UPB Conecta

Plataforma móvil centralizada de información académica para la UPB Seccional Bucaramanga: reúne en una sola aplicación las convocatorias con fecha de cierre y la oferta de prácticas que hoy se dispersan en el correo masivo institucional y en los canales de cada coordinación, clasificadas por programa académico, con notificaciones anticipadas, mapa del campus, foro con identidad verificada y moderación automática, y un chatbot de preguntas frecuentes.

Proyecto académico de **Proyecto Integrador III**, Ingeniería de Sistemas e Informática, Universidad Pontificia Bolivariana — Seccional Bucaramanga, 2026-20.

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Miguel José Vargas Martínez |
| Scrum Master | Johan Sebastián Almeida Rincón |
| Developer | Juan Eduardo Benítez Pájaro |

## Estructura del repositorio

Dos proyectos independientes, cada uno con su propio ciclo de vida, dependencias y CI — conectados únicamente por un contrato REST (todavía por construir en el backend):

```
backend/    Node.js + TypeScript, arquitectura hexagonal. Ingesta, dominio y persistencia (MongoDB).
Frontend/   Android + Kotlin (Jetpack Compose). UI de la app móvil, hoy con datos de ejemplo.
```

Ver el README de cada subcarpeta para arquitectura, cómo levantar el entorno y estado de historias implementadas:

- [`backend/README.md`](backend/README.md)
- [`Frontend/README.md`](Frontend/README.md)
- [`Frontend/ARQUITECTURA-INTEGRACION.md`](Frontend/ARQUITECTURA-INTEGRACION.md) — plan de integración entre los dos proyectos vía API REST (aún no implementada: el backend hoy solo hace ingesta a MongoDB, no expone endpoints HTTP).

## Estado actual

- **Backend:** HU-01, HU-05 y HU-53 implementadas y en `main`, 56/56 pruebas en verde, CI con `main` protegida (PR obligatorio).
- **Frontend:** UI preliminar completa (splash, inicio, noticias, foro, mapa esquemático, chatbot, perfil) sobre datos mock; sin conexión real al backend todavía.
- El resto del backlog (11 épicas, 51 historias restantes) vive en Jira sin código asociado.
