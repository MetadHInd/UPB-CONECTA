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

- **Backend:** HU-01, HU-02, HU-03, HU-04 (criterios 1-4), HU-05, HU-06, HU-07, HU-08, HU-09, HU-10, HU-11, HU-12, HU-15 (criterios 1-4), HU-16 (criterios 1/2/3/5), HU-18 (criterios 1-5), HU-21 (criterios 1/2/3/6), HU-30, HU-37, HU-38 (criterios 1/2/3/5/6), HU-43, HU-44 (criterios 2/4/5/6), HU-45, HU-46, HU-47 (criterios 3-7; 1-2 diferidos, ver README de `hardening`), HU-49, HU-50, HU-53, HU-54 y HU-55 (criterios 3-4) implementadas, 647/647 pruebas en verde en `main`, CI con `main` protegida (PR obligatorio).
- **Frontend:** UI preliminar completa (splash, inicio, noticias, foro, mapa esquemático, chatbot, perfil) sobre datos mock, más HU-17 (caché offline real con Room, sincronización al recuperar la red); sin conexión real al backend todavía.
- El resto del backlog (11 épicas, 51 historias restantes) vive en Jira sin código asociado.
