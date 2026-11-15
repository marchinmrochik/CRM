import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CrmService, parse } from './crm.service';

export const ownerId = 'local-owner';
@ApiTags('Manual CRM')
@Controller('api/v1')
export class CrmController {
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}
  @Get('auth/me') me(@Req() req: Request) {
    return { authenticated: !!req.session.ownerId };
  }
  @Get('companies') companies() {
    return this.crm.db.company.findMany({ where: { ownerId }, orderBy: { name: 'asc' } });
  }
  @Get('today') async today() {
    const until = new Date(Date.now() + 7 * 86400000);
    const include = {
      application: {
        select: { vacancy: { select: { title: true, company: { select: { name: true } } } } },
      },
    };
    const [actions, interviews, unseen, drafts] = await this.crm.db.$transaction([
      this.crm.db.nextAction.findMany({
        where: { application: { ownerId }, completedAt: null, dueAt: { lte: until } },
        include,
        orderBy: { dueAt: 'asc' },
        take: 20,
      }),
      this.crm.db.interview.findMany({
        where: { application: { ownerId }, status: 'scheduled', scheduledAt: { lte: until } },
        include,
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      }),
      this.crm.db.discoveryListing.count({
        where: { ownerId, seenAt: null, disposition: { not: 'dismissed' } },
      }),
      this.crm.db.application.count({ where: { ownerId, status: 'draft' } }),
    ]);
    return { actions, interviews, unseen, drafts };
  }
  @Post('companies') addCompany(@Body() body: unknown) {
    return this.crm.saveCompany(ownerId, body);
  }
  @Patch('companies/:id') editCompany(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.saveCompany(ownerId, body, id);
  }
  @Post('companies/:id/archive') async archiveCompany(@Param('id') id: string) {
    await this.crm.company(ownerId, id);
    return this.crm.db.company.update({ where: { id }, data: { archived: true } });
  }
  @Get('vacancies') vacancies() {
    return this.crm.db.vacancy.findMany({
      where: { ownerId },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
  @Post('vacancies') addVacancy(@Body() body: unknown) {
    return this.crm.saveVacancy(ownerId, body);
  }
  @Patch('vacancies/:id') editVacancy(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.saveVacancy(ownerId, body, id);
  }
  @Post('vacancies/:id/disposition') async disposition(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.crm.vacancy(ownerId, id);
    const data = parse(
      z.object({ disposition: z.enum(['inbox', 'shortlisted', 'dismissed', 'archived']) }),
      body,
    );
    return this.crm.db.vacancy.update({ where: { id }, data });
  }
  @Get('applications') applications(@Query() query: Record<string, unknown>) {
    return this.crm.list(ownerId, query);
  }
  @Post('applications') addApplication(@Body() body: unknown) {
    return this.crm.createApplication(ownerId, body);
  }
  @Get('applications/:id') application(@Param('id') id: string) {
    return this.crm.application(ownerId, id);
  }
  @Post('applications/:id/transition') transition(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.transition(ownerId, id, body);
  }
  @Post('applications/:id/notes') note(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.addNote(ownerId, id, body);
  }
  @Post('applications/:id/actions') action(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.addAction(ownerId, id, body);
  }
  @Post('applications/:id/actions/:actionId/complete') complete(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.crm.completeAction(ownerId, id, actionId);
  }
  @Post('applications/:id/interviews') interview(@Param('id') id: string, @Body() body: unknown) {
    return this.crm.addInterview(ownerId, id, body);
  }
  @Patch('applications/:id/interviews/:interviewId') updateInterview(
    @Param('id') id: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
  ) {
    return this.crm.updateInterview(ownerId, id, interviewId, body);
  }
  @Get('resumes') resumes() {
    return this.crm.db.resumeArtifact.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        size: true,
        createdAt: true,
        version: { select: { id: true, number: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Post('resumes')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 0,
        parts: 2,
        fieldNameSize: 100,
        headerPairs: 50,
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.crm.upload(ownerId, file);
  }
  @Get('resumes/:id/download') async download(@Param('id') id: string, @Res() res: Response) {
    const { row, buffer } = await this.crm.download(ownerId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      'Cache-Control': 'no-store',
    });
    res.send(buffer);
  }
  @Get('overview') async overview() {
    const [groups, vacancies, actions, submitted] = await this.crm.db.$transaction([
      this.crm.db.application.groupBy({
        by: ['status'],
        where: { ownerId },
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.crm.db.vacancy.count({ where: { ownerId, disposition: { not: 'archived' } } }),
      this.crm.db.nextAction.findMany({
        where: { completedAt: null, application: { ownerId } },
        include: { application: { include: { vacancy: { include: { company: true } } } } },
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
      this.crm.db.application.count({ where: { ownerId, submittedAt: { not: null } } }),
    ]);
    return { groups, vacancies, actions, submitted };
  }
  @Get('sources') sources() {
    return [
      {
        name: 'DOU',
        url: 'https://jobs.dou.ua/',
        category: 'Ukrainian tech',
        connection: 'Directory only',
      },
      {
        name: 'Djinni',
        url: 'https://djinni.co/jobs/',
        category: 'Ukrainian tech',
        connection: 'Directory only',
      },
      {
        name: 'LinkedIn',
        url: 'https://www.linkedin.com/jobs/',
        category: 'Global',
        connection: 'Directory only',
      },
      {
        name: 'Adzuna',
        url: 'https://www.adzuna.com/',
        category: 'Europe and USA',
        connection: 'API key required · not connected',
      },
      {
        name: 'Jooble',
        url: 'https://jooble.org/',
        category: 'Global',
        connection: 'API key required · not connected',
      },
      {
        name: 'Reed',
        url: 'https://www.reed.co.uk/',
        category: 'United Kingdom',
        connection: 'API key required · not connected',
      },
      {
        name: 'The Muse',
        url: 'https://www.themuse.com/search/jobs',
        category: 'USA',
        connection: 'Registration required · not connected',
      },
      {
        name: 'Careerjet',
        url: 'https://www.careerjet.com/',
        category: 'Global',
        connection: 'API key required · not connected',
      },
      {
        name: 'EURES',
        url: 'https://eures.europa.eu/index_en',
        category: 'Europe',
        connection: 'Directory only',
      },
      {
        name: 'Indeed',
        url: 'https://www.indeed.com/',
        category: 'Global',
        connection: 'Directory only',
      },
      {
        name: 'Glassdoor',
        url: 'https://www.glassdoor.com/Job/',
        category: 'Global',
        connection: 'Directory only',
      },
      {
        name: 'France Travail',
        url: 'https://www.francetravail.fr/',
        category: 'France',
        connection: 'Registration required · not connected',
      },
      {
        name: 'USAJOBS',
        url: 'https://www.usajobs.gov/',
        category: 'USA',
        connection: 'API key required · not connected',
      },
      {
        name: 'We Work Remotely',
        url: 'https://weworkremotely.com/',
        category: 'Remote',
        connection: 'Directory only',
      },
      {
        name: 'Wellfound',
        url: 'https://wellfound.com/jobs',
        category: 'Startups',
        connection: 'Directory only',
      },
    ];
  }
  @Get('export/json') async json(@Res() res: Response) {
    res
      .set('Content-Disposition', 'attachment; filename="jobhunt-export.json"')
      .json(await this.crm.exportData(ownerId));
  }
  @Get('export/csv') async csv(@Res() res: Response) {
    const data = await this.crm.exportData(ownerId);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['id', 'company', 'role', 'status', 'submitted_at', 'resume_id'],
      ...data.applications.map((a) => {
        const vacancy = data.vacancies.find((v) => v.id === a.vacancyId);
        return [
          a.id,
          data.companies.find((c) => c.id === vacancy?.companyId)?.name ?? '',
          vacancy?.title ?? '',
          a.status,
          a.submittedAt?.toISOString() ?? '',
          a.resumeId ?? '',
        ];
      }),
    ];
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="jobhunt-applications.csv"',
      })
      .send('\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n'));
  }
}
