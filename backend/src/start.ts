/**
 * Punto de arranque unico para el despliegue: `SERVICE_ROLE` decide que proceso
 * corre. `api` (por defecto) es el servidor HTTP; `worker` son los
 * planificadores de ingesta y avisos. Asi un mismo repositorio y un mismo
 * comando (`npm start`) sirven a los dos servicios de Railway, sin depender de
 * que la plataforma aplique un comando de arranque distinto por servicio.
 */
const role = (process.env['SERVICE_ROLE'] ?? 'api').trim().toLowerCase();

if (role === 'api') {
  await import('./http-server.js');
} else if (role === 'worker') {
  await import('./main.js');
} else {
  console.error(`[start] SERVICE_ROLE invalido: "${role}". Use "api" o "worker".`);
  process.exit(1);
}

export {};
