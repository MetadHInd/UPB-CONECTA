#!/usr/bin/env node
/**
 * Verificacion de la regla de dependencia hexagonal (RNF-41).
 *
 * La capa de dominio no importa framework, persistencia ni cliente externo, y
 * la capa de aplicacion no importa infraestructura. Cockburn advierte que en
 * los diagramas por capas la gente tiende a no tomarse en serio las lineas;
 * este script convierte la linea en una condicion que rompe la construccion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const FORBIDDEN_IN_DOMAIN = [/from ['"]mongodb['"]/, /from ['"]express['"]/, /infrastructure\//, /node:/];
const FORBIDDEN_IN_APPLICATION = [/from ['"]mongodb['"]/, /infrastructure\//];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const content = readFileSync(file, 'utf8');
  const rules = rel.includes('/domain/')
    ? FORBIDDEN_IN_DOMAIN
    : rel.includes('/application/')
      ? FORBIDDEN_IN_APPLICATION
      : [];

  for (const rule of rules) {
    if (rule.test(content)) violations.push(`${rel} viola la regla ${rule}`);
  }
}

if (violations.length > 0) {
  console.error('Violaciones de la regla de dependencia (RNF-41):');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('Regla de dependencia respetada: el dominio no conoce la infraestructura.');
