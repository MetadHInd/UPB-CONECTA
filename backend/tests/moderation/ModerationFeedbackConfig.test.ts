import { describe, expect, it } from 'vitest';
import {
  findNormForCategory,
  InvalidModerationFeedbackConfigError,
  parseModerationFeedbackConfig
} from '../../src/contexts/moderation/domain/value-objects/ModerationFeedbackConfig.js';
import { loadModerationFeedbackConfig } from '../../src/contexts/moderation/infrastructure/config/JsonModerationFeedbackConfig.js';
import { blockedFeedback, inReviewFeedback, UnknownInfractionCategoryError } from '../../src/contexts/moderation/domain/services/AuthorFeedbackPolicy.js';
import { NOW, TEST_CONFIG } from './feedbackHarness.js';

const norm = { category: 'spam', code: 'NC-05', title: 'Spam', text: 'No spam.' };

describe('ModerationFeedbackConfig', () => {
  it('config/moderation-feedback.json es valida: plazo de 24 h y una norma por categoria', async () => {
    const config = await loadModerationFeedbackConfig();

    expect(config.resolutionDeadlineHours).toBe(24);
    expect(findNormForCategory(config, 'harassment')?.code).toBe('NC-01');
    expect(findNormForCategory(config, 'other')).not.toBeNull();
    expect(findNormForCategory(config, 'inventada')).toBeNull();
  });

  it.each([
    ['no es objeto', []],
    ['plazo cero', { resolutionDeadlineHours: 0, norms: [norm] }],
    ['plazo fraccionario', { resolutionDeadlineHours: 1.5, norms: [norm] }],
    ['plazo como texto', { resolutionDeadlineHours: '24', norms: [norm] }],
    ['sin normas', { resolutionDeadlineHours: 24, norms: [] }],
    ['norma no objeto', { resolutionDeadlineHours: 24, norms: ['x'] }],
    ['norma sin texto', { resolutionDeadlineHours: 24, norms: [{ ...norm, text: ' ' }] }],
    ['categoria repetida', { resolutionDeadlineHours: 24, norms: [norm, { ...norm, code: 'NC-99' }] }],
    ['codigo repetido', { resolutionDeadlineHours: 24, norms: [norm, { ...norm, category: 'otra' }] }]
  ])('rechaza una configuracion invalida: %s', (_name, raw) => {
    expect(() => parseModerationFeedbackConfig(raw)).toThrow(InvalidModerationFeedbackConfigError);
  });

  it('el texto de la vista sale de la configuracion y usa singular para 1 hora', () => {
    const config = { ...TEST_CONFIG, resolutionDeadlineHours: 1 };

    expect(inReviewFeedback(config, 'c', NOW).message).toContain('1 hora.');
    expect(blockedFeedback(config, 'c', 'spam').norm).toEqual({ code: 'NC-05', title: 'Spam', text: 'No se permite el spam.' });
    expect(() => blockedFeedback(config, 'c', 'inventada')).toThrow(UnknownInfractionCategoryError);
  });
});
