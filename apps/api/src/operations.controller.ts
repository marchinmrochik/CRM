import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ownerId } from './crm.controller';
import { OperationsService } from './operations.service';
@Controller('api/v1')
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations: OperationsService) {}
  @Get('operations') list(@Query('targetId') targetId?: string) {
    return this.operations.list(ownerId, targetId);
  }
  @Get('operations/health') health() {
    return this.operations.health();
  }
  @Get('operations/:id') get(@Param('id') id: string) {
    return this.operations.get(ownerId, id);
  }
  @Post('operations/:id/retry') retry(@Param('id') id: string) {
    return this.operations.retry(ownerId, id);
  }
  @Post('operations/check') check(@Body() body: unknown) {
    return this.operations.diagnostic(ownerId, body);
  }
  @Post('resume-drafts/:id/analyze') analyze(@Param('id') id: string, @Body() body: unknown) {
    return this.operations.analyze(ownerId, id, body);
  }
  @Post('operations/:id/suggestions') decide(@Param('id') id: string, @Body() body: unknown) {
    return this.operations.decide(ownerId, id, body);
  }
  @Post('operations/:id/requirements') requirements(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.operations.adoptRequirements(ownerId, id, body);
  }
}
