import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ResumeService } from './resume.service';
import { ownerId } from './crm.controller';
import { OperationsService } from './operations.service';
@ApiTags('Structured resumes')
@Controller('api/v1')
export class ResumeController {
  constructor(
    @Inject(ResumeService) private readonly resumes: ResumeService,
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  @Get('profile') async profile(@Res() res: Response) {
    res.json(await this.resumes.profile(ownerId));
  }
  @Put('profile') saveProfile(@Body() body: unknown) {
    return this.resumes.saveProfile(ownerId, body);
  }
  @Get('resume-drafts') list() {
    return this.resumes.list(ownerId);
  }
  @Post('resume-drafts') create(@Body() body: unknown) {
    return this.resumes.create(ownerId, body);
  }
  @Get('resume-drafts/:id') draft(@Param('id') id: string) {
    return this.resumes.draft(ownerId, id);
  }
  @Patch('resume-drafts/:id') save(@Param('id') id: string, @Body() body: unknown) {
    return this.resumes.save(ownerId, id, body);
  }
  @Post('resume-drafts/:id/publish') publish(@Param('id') id: string, @Body() body: unknown) {
    return this.operations.publish(ownerId, id, body);
  }
  @Get('resume-versions/:id') version(@Param('id') id: string) {
    return this.resumes.version(ownerId, id);
  }
  @Post('resume-versions/:id/fork') fork(@Param('id') id: string) {
    return this.resumes.fork(ownerId, id);
  }
}
