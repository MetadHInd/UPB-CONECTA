import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseModerationFeedbackConfig, type ModerationFeedbackConfig } from '../../domain/value-objects/ModerationFeedbackConfig.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/moderation-feedback.json', import.meta.url);

/** Mismo patron que `loadProgramCatalog` (HU-07): el JSON se lee y se valida al arrancar. */
export async function loadModerationFeedbackConfig(
  configPath: string | URL = DEFAULT_CONFIG_PATH
): Promise<ModerationFeedbackConfig> {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  return parseModerationFeedbackConfig(JSON.parse(readFileSync(resolvedPath, 'utf8')));
}
