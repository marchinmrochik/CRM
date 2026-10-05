import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { databaseUrl } from './config';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
