import { Body, Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { ownerId } from './crm.controller';
@ApiTags('Analytics and evidence')
@Controller('api/v1')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}
  @Get('analytics') report(@Query() query: Record<string, unknown>) {
    return this.analytics.report(ownerId, query);
  }
  @Get('analytics/export') async export(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    return response
      .set('Content-Disposition', 'attachment; filename="jobhunt-analytics.json"')
      .json(await this.analytics.report(ownerId, query));
  }
  @Post('applications/:id/milestones') record(@Param('id') id: string, @Body() body: unknown) {
    return this.analytics.record(ownerId, id, body);
  }
  @Post('applications/:id/milestones/:eventId/void') void(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.analytics.void(ownerId, id, eventId, body);
  }
}
