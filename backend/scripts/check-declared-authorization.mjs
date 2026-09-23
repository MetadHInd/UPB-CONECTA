#!/usr/bin/env node
/**
 * HU-46, criterio 5: "dado una operacion sin verificacion de rol declarada,
 * cuando se ejecuta el analisis de seguridad, la ausencia se detecta como
 * hallazgo antes del despliegue". Mismo espiritu que `check-architecture.mjs`
 * (RNF-41): convertir una regla que depende de que alguien se acuerde en una
 * condicion que rompe la construccion si no se cumple.
 *
 * Que verifica. Un caso de uso (clase exportada en `src/contexts/* /application/*.ts`)
 * cuyo nombre coincide con un verbo administrativo conocido (ver
 * `ADMIN_VERB_PATTERN`) pero no aparece en `config/protected-operations.json`
 * se reporta como hallazgo: "parece una operacion administrativa, pero nadie
 * declaro que rol requiere".
 *
 * Que NO verifica (limite explicito, igual que `check-architecture.mjs` es
 * solo un regex sobre el contenido del archivo, no un analisis semantico
 * real): esto es un patron de nombres, no prueba de intencion. Un caso de
 * uso administrativo con un nombre que no calce con `ADMIN_VERB_PATTERN`
 * (por ejemplo, un futuro "SuspendAccount" si el patron no lo cubriera)
 * pasaria sin marcarse. La lista de verbos se amplia a mano cuando aparece
 * un caso asi — no hay forma de inferirla automaticamente sin tipar cada
 * caso de uso con una interfaz que declare su naturaleza, que es mas
 * cambio del que esta historia pide.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Verbos administrativos conocidos. No exhaustivo — ver limite explicito arriba. */
const ADMIN_VERB_PATTERN = /^(Manage|Correct|Quarantine|Review|Moderate|Approve|Reject|Suspend|Withdraw|Publish|Delete|Ban|Admin)/;

const CLASS_EXPORT_PATTERN = /export class ([A-Za-z0-9]+)/g;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

function findApplicationUseCaseFiles(srcRoot) {
  const contextsDir = join(srcRoot, 'contexts');
  return walk(contextsDir).filter((file) => relative(contextsDir, file).includes('/application/'));
}

function extractExportedClassNames(fileContent) {
  const names = [];
  for (const match of fileContent.matchAll(CLASS_EXPORT_PATTERN)) {
    const name = match[1];
    if (!name.endsWith('Error')) names.push(name);
  }
  return names;
}

export function checkDeclaredAuthorization(root = DEFAULT_ROOT) {
  const catalogPath = join(root, 'config', 'protected-operations.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const declaredOperations = new Set(catalog.operations.map((entry) => entry.operation));

  const srcRoot = join(root, 'src');
  const findings = [];

  for (const file of findApplicationUseCaseFiles(srcRoot)) {
    const content = readFileSync(file, 'utf8');
    for (const className of extractExportedClassNames(content)) {
      if (ADMIN_VERB_PATTERN.test(className) && !declaredOperations.has(className)) {
        findings.push(`${relative(root, file)}: '${className}' parece una operacion administrativa sin rol declarado en config/protected-operations.json`);
      }
    }
  }

  if (findings.length > 0) {
    const header = 'Operaciones administrativas sin rol declarado (HU-46, criterio 5):';
    const err = new Error([header, ...findings.map((f) => `  - ${f}`)].join('\n'));
    err.name = 'DeclaredAuthorizationViolationError';
    throw err;
  }
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('check-declared-authorization.mjs')) {
  try {
    checkDeclaredAuthorization();
    console.log('Analisis de autorizacion declarada: sin hallazgos.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
