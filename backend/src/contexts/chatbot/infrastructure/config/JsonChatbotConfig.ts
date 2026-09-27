import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OfficialChannel, OutOfScopePolicyConfig } from '../../domain/value-objects/ChatbotConfig.js';

const CHANNEL_PATH = new URL('../../../../../config/chatbot-official-channel.json', import.meta.url);
const SCOPE_PATH = new URL('../../../../../config/chatbot-out-of-scope.json', import.meta.url);

function readJson<T>(path: string | URL): T {
  return JSON.parse(readFileSync(typeof path === 'string' ? path : fileURLToPath(path), 'utf8')) as T;
}

/** Mismo patron que `loadRateLimitPolicyCatalog` (HU-47). */
export function loadOfficialChannel(path: string | URL = CHANNEL_PATH): OfficialChannel {
  return readJson<OfficialChannel>(path);
}

export function loadOutOfScopePolicy(path: string | URL = SCOPE_PATH): OutOfScopePolicyConfig {
  return readJson<OutOfScopePolicyConfig>(path);
}
