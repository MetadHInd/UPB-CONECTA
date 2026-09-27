import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { KnowledgeBaseSchema } from '../../domain/services/KnowledgeEntryValidation.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/knowledge-base.json', import.meta.url);

/** Esquema como dato (HU-41): categorias y limites se cambian en el JSON, no en el codigo. */
export async function loadKnowledgeBaseSchema(configPath: string | URL = DEFAULT_CONFIG_PATH): Promise<KnowledgeBaseSchema> {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  return JSON.parse(readFileSync(resolvedPath, 'utf8')) as KnowledgeBaseSchema;
}
