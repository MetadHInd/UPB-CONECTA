import type { TopicSeed } from '../../application/SeedDefaultTopics.js';

/**
 * Temas iniciales del foro (HU-30 criterio 3). Son datos de partida: despues
 * de sembrarlos, el administrador los edita, restringe o retira con
 * `ManageTopics`, y agrega los que necesite sin tocar este archivo.
 */
export const DEFAULT_FORUM_TOPICS: readonly TopicSeed[] = [
  { id: 'academico', name: 'Académico', description: 'Dudas de asignaturas, grupos de estudio y material de clase.' },
  { id: 'compraventa', name: 'Compraventa entre estudiantes', description: 'Compra y venta de libros, equipos y otros artículos entre estudiantes.' },
  { id: 'eventos', name: 'Eventos', description: 'Actividades, charlas y encuentros de la comunidad universitaria.' },
  { id: 'general', name: 'Espacio general', description: 'Conversación abierta entre estudiantes.' }
];
