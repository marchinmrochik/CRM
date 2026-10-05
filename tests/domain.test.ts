import { describe, expect, it } from 'vitest';
import { transitionProblem, vacancyInput } from '../apps/api/src/domain';
describe('Application lifecycle', () => {
  it('requires a recorded submission before interview progress', () =>
    expect(transitionProblem('draft', 'in_progress', false, false)).toBeTruthy());
  it('does not erase a submitted application by returning to draft', () =>
    expect(transitionProblem('applied', 'draft', true, false)).toBeTruthy());
  it('requires confirmation when reopening a rejected application', () => {
    expect(transitionProblem('rejected', 'in_progress', true, false)).toBeTruthy();
    expect(transitionProblem('rejected', 'in_progress', true, true)).toBeNull();
  });
  it('requires an offer before acceptance', () =>
    expect(transitionProblem('in_progress', 'accepted', true, false)).toBeTruthy());
  it('preserves unknown eligibility and blocks unsafe source links', () => {
    const data = {
      companyId: '00000000-0000-4000-8000-000000000001',
      title: 'Senior React',
      description: 'Remote role',
    };
    expect(vacancyInput.parse(data).eligibility).toBe('unknown');
    expect(vacancyInput.safeParse({ ...data, url: 'javascript:alert(1)' }).success).toBe(false);
  });
});
