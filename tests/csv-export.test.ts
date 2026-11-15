import { it, expect, vi } from 'vitest';
import type { Response } from 'express';
vi.mock('../apps/api/src/database', () => ({ Database: class {} }));
import { CrmController } from '../apps/api/src/crm.controller';
import type { CrmService } from '../apps/api/src/crm.service';
it('neutralizes spreadsheet formulas and escapes CSV quotes/newlines', async () => {
  const names = [
    '=SUM(1,2)',
    '+cmd',
    '@command',
    '-10',
    ' \t=calc',
    'Company "quoted", inc\nSecond line',
  ];
  const data = {
    companies: names.map((name, i) => ({ id: String(i), name })),
    vacancies: names.map((_, i) => ({
      id: String(i),
      companyId: String(i),
      title: 'Role "with quotes"',
    })),
    applications: names.map((_, i) => ({
      id: String(i),
      vacancyId: String(i),
      status: 'draft',
      submittedAt: null,
      resumeId: null,
    })),
  };
  const exportData = vi.fn().mockResolvedValue(data);
  let csv = '';
  const response = {
    set: vi.fn().mockReturnThis(),
    send: vi.fn((value: string) => {
      csv = value;
    }),
  };
  await new CrmController({ exportData } as unknown as CrmService).csv(
    response as unknown as Response,
  );
  for (const name of names.slice(0, 5)) expect(csv).toContain(`"'${name}"`);
  expect(csv).toContain('Company ""quoted"", inc\nSecond line');
  expect(csv).toContain('Role ""with quotes""');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(response.set).toHaveBeenCalledWith(
    expect.objectContaining({ 'Content-Type': 'text/csv; charset=utf-8' }),
  );
});
