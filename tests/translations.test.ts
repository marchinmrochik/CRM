import { describe, it, expect } from 'vitest';
import {
  translate,
  statusLabel,
  eventLabel,
  formatDate,
  messages,
  type Locale,
} from '../apps/web/lib/translations';
describe('localization preserves evidence and user text', () => {
  it.each(['en', 'ru', 'uk'] as Locale[])(
    'interpolates %s numbers and leaves unavailable values visible',
    (locale) => {
      expect(translate(locale, 'Unseen jobs: {count}', { count: 0 })).toContain('0');
      expect(translate(locale, 'Unseen jobs: {count}')).toContain('{count}');
      expect(translate(locale, 'Custom personal note')).toBe('Custom personal note');
      expect(formatDate(locale)).toBe('—');
      expect(formatDate(locale, '2026-11-01T12:00:00Z')).toMatch(/2026/);
      expect(statusLabel(locale, 'my_custom_status')).toBe('My custom status');
      expect(eventLabel(locale, { label: 'Personal employer wording' })).toBe(
        'Personal employer wording',
      );
      expect(eventLabel(locale, { label: 'draft → applied' })).toBe(
        `${statusLabel(locale, 'draft')} → ${statusLabel(locale, 'applied')}`,
      );
      for (const kind of [
        'recruiter_response',
        'human_interaction',
        'interview',
        'final_interview',
        'offer',
        'custom',
      ])
        expect(eventLabel(locale, { label: 'Milestone: ' + kind })).not.toContain('Milestone:');
    },
  );
  it('provides nonempty translations and matching interpolation keys', () => {
    for (const [en, ru, uk] of messages) {
      expect(ru.trim(), en).not.toBe('');
      expect(uk.trim(), en).not.toBe('');
      const keys = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(keys(ru), en).toEqual(keys(en));
      expect(keys(uk), en).toEqual(keys(en));
    }
  });
  it('translates core application statuses and keeps unknown events intact', () => {
    expect(statusLabel('ru', 'applied')).toBe('Отправлен');
    expect(statusLabel('uk', 'applied')).toBe('Надіслано');
    for (const label of [
      'Milestone corrected',
      'Next action completed',
      'Note added',
      'Application draft created',
    ])
      expect(eventLabel('ru', { label })).not.toBe(label);
  });
});
