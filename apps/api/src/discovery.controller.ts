import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { ownerId } from './crm.controller';

@ApiTags('Discovery')
@Controller('api/v1/discovery')
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}
  @Get('sources') sources() {
    return this.discovery.sources(ownerId);
  }
  @Patch('sources/:connector') configure(
    @Param('connector') connector: string,
    @Body() body: unknown,
  ) {
    return this.discovery.configure(ownerId, connector, body);
  }
  @Post('sources/:connector/import') import(@Param('connector') connector: string) {
    return this.discovery.enqueue(ownerId, connector);
  }
  @Get('listings') listings(@Query() query: Record<string, unknown>) {
    return this.discovery.list(ownerId, query);
  }
  @Get('listings/:id') detail(@Param('id') id: string) {
    return this.discovery.detail(ownerId, id);
  }
  @Post('listings/:id/decision') decide(@Param('id') id: string, @Body() body: unknown) {
    return this.discovery.decide(ownerId, id, body);
  }
  @Post('listings/:id/promote') promote(@Param('id') id: string) {
    return this.discovery.promote(ownerId, id);
  }
  @Get('searches') searches() {
    return this.discovery.searches(ownerId);
  }
  @Post('searches') save(@Body() body: unknown) {
    return this.discovery.saveSearch(ownerId, body);
  }
  @Delete('searches/:id') delete(@Param('id') id: string) {
    return this.discovery.deleteSearch(ownerId, id);
  }
}
