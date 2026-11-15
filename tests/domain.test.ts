import { describe, expect, it } from 'vitest';
import {
  transitionProblem,
  vacancyInput,
  companyInput,
  transitionInput,
  statuses,
  terminal,
} from '../apps/api/src/domain';
describe('Application lifecycle', () => {
  it.each(statuses)('rejects an unchanged %s status', (status) =>
    expect(transitionProblem(status, status, status !== 'draft', false)).toBeTruthy(),
  );
  it.each([...terminal])('requires reopening %s before any change', (status) => {
    expect(transitionProblem(status, 'in_progress', true, false)).toBeTruthy();
    expect(transitionProblem(status, 'in_progress', true, true)).toBeNull();
  });
  it.each(['in_progress', 'offer_received', 'accepted', 'rejected'])(
    'rejects unsubmitted advancement to %s',
    (status) => expect(transitionProblem('draft', status, false, false)).toBeTruthy(),
  );
  it.each(['applied', 'withdrawn'])('allows the initial %s transition', (status) =>
    expect(transitionProblem('draft', status, false, false)).toBeNull(),
  );
  it('allows acceptance of a recorded offer', () =>
    expect(transitionProblem('offer_received', 'accepted', true, false)).toBeNull());
  it.each(['javascript:alert(1)', 'http://example.com', 'data:text/html,test'])(
    'rejects unsafe company website %s',
    (website) => expect(companyInput.safeParse({ name: 'Fixture', website }).success).toBe(false),
  );
  it('bounds company names and revision input', () => {
    expect(companyInput.safeParse({ name: ' '.repeat(4) }).success).toBe(false);
    expect(companyInput.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
    expect(transitionInput.safeParse({ status: 'applied', revision: -1 }).success).toBe(false);
    expect(transitionInput.safeParse({ status: 'unknown', revision: 0 }).success).toBe(false);
    expect(
      transitionInput.safeParse({ status: 'applied', revision: 0, submittedAt: 'yesterday' })
        .success,
    ).toBe(false);
  });
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
