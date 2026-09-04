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
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FORBIDDEN_IN_DOMAIN = [/from ['"]mongodb['"]/, /from ['"]express['"]/, /infrastructure\//, /node:/];
const FORBIDDEN_IN_APPLICATION = [/from ['"]mongodb['"]/, /infrastructure\//];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

export function checkArchitecture(root = DEFAULT_ROOT) {
  const SRC = join(root, 'src');
  const violations = [];

  for (const file of walk(SRC)) {
    const rel = relative(root, file);
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
    const header = 'Violaciones de la regla de dependencia (RNF-41):';
    const details = [header, ...violations.map((v) => `  - ${v}`)].join('\n');
    const err = new Error(details);
    err.name = 'DependencyRuleViolationError';
    throw err;
  }
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('check-architecture.mjs')) {
  try {
    checkArchitecture();
    console.log('Regla de dependencia respetada: el dominio no conoce la infraestructura.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
