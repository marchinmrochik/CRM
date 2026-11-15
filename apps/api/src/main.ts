import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { passwordVerifier, validOwnerSession, SESSION_MAX_AGE_MS } from './security';
import type { Request, Response, NextFunction } from 'express';
import { CrmController, ownerId } from './crm.controller';
import { CrmService } from './crm.service';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { OperationsService } from './operations.service';
import { OperationsController } from './operations.controller';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Database } from './database';
import { databaseUrl, settings } from './config';

@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { requestId: string }>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : null;
    if (status >= 500)
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'request_failed',
          requestId: req.requestId,
          error: error instanceof Error ? error.name : 'Unknown',
          time: new Date().toISOString(),
        }),
      );
    res.status(status).json({
      code: `HTTP_${status}`,
      message:
        status >= 500
          ? 'Service unavailable. Check System activity and try again.'
          : typeof detail === 'string'
            ? detail
            : 'Request failed.',
      ...(status < 500 && detail && typeof detail === 'object' ? detail : {}),
      requestId: req.requestId,
    });
  }
}
@Module({
  controllers: [
    CrmController,
    ResumeController,
    OperationsController,
    DiscoveryController,
    AnalyticsController,
  ],
  providers: [
    Database,
    CrmService,
    ResumeService,
    OperationsService,
    DiscoveryService,
    AnalyticsService,
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '256kb' });
  const db = app.get(Database);
  await db.$connect();
  if (!settings.OWNER_PASSWORD || !settings.SESSION_SECRET)
    throw new Error('API authentication configuration is missing.');
  const verifyPassword = await passwordVerifier(settings.OWNER_PASSWORD);
  app.use(helmet());
  app.use((req: Request & { requestId: string }, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    res.on('finish', () =>
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'request',
          time: new Date().toISOString(),
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
    next();
  });
  const Store = pgSession(session);
  app.use(
    session({
      store: new Store({ conString: databaseUrl, createTableIfMissing: false }),
      secret: settings.SESSION_SECRET,
      name: 'jobhunt.sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: settings.COOKIE_SECURE === 'true',
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    }),
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.session.ownerId && !validOwnerSession(req.session, ownerId)) {
      req.session.destroy(() => {
        res.clearCookie('jobhunt.sid');
        res
          .status(req.path === '/api/v1/auth/me' ? 200 : 401)
          .json(
            req.path === '/api/v1/auth/me'
              ? { authenticated: false }
              : { code: 'UNAUTHORIZED', message: 'Sign in to your private workspace.' },
          );
      });
      return;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== settings.WEB_ORIGIN || req.headers['x-jobhunt-client'] !== 'web')
    ) {
      res.status(403).json({ code: 'CSRF', message: 'Invalid request origin.' });
      return;
    }
    if (
      [
        '/api/v1/auth/login',
        '/api/v1/auth/me',
        '/api/v1/health/live',
        '/api/v1/health/ready',
      ].includes(req.path)
    ) {
      next();
      return;
    }
    if (!validOwnerSession(req.session, ownerId)) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Sign in to your private workspace.' });
      return;
    }
    next();
  });
  const express = app.getHttpAdapter().getInstance();
  express.post(
    '/api/v1/auth/login',
    rateLimit({ windowMs: 60000, limit: 10 }),
    async (req: Request, res: Response) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      let valid: boolean;
      try {
        valid = await verifyPassword(password);
      } catch {
        res.status(503).json({ message: 'Authentication is busy. Try again.' });
        return;
      }
      if (!valid) {
        res.status(401).json({ message: 'Incorrect password.' });
        return;
      }
      req.session.regenerate((error) => {
        if (error) {
          res.status(503).json({ message: 'Session storage unavailable.' });
          return;
        }
        req.session.ownerId = ownerId;
        req.session.authenticatedAt = Date.now();
        req.session.save((error) => res.status(error ? 503 : 200).json({ authenticated: !error }));
      });
    },
  );
  express.post('/api/v1/auth/logout', (req: Request, res: Response) =>
    req.session.destroy((error) => {
      res.clearCookie('jobhunt.sid');
      res.status(error ? 503 : 200).json({ ok: !error });
    }),
  );
  express.get('/api/v1/health/live', (_req: Request, res: Response) =>
    res.json({ status: 'healthy', service: 'api', instance: process.pid, startedAt }),
  );
  express.get('/api/v1/health/ready', async (_req: Request, res: Response) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({
        api: 'healthy',
        database: 'healthy',
        observedAt: new Date().toISOString(),
        startedAt,
        ...(await app.get(OperationsService).health()),
      });
    } catch {
      res.status(503).json({
        api: 'healthy',
        database: 'unavailable',
        reason: 'Database readiness query failed',
        observedAt: new Date().toISOString(),
      });
    }
  });
  app.useGlobalFilters(new SafeErrors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Job Search OS API')
      .setVersion('1')
      .addCookieAuth('jobhunt.sid')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  app.enableShutdownHooks();
  await app.listen(settings.API_PORT, process.env.API_BIND_HOST ?? '127.0.0.1');
}
const startedAt = new Date().toISOString();
bootstrap().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      error: error instanceof Error ? error.message.replace(databaseUrl, '[database]') : 'Unknown',
    }),
  );
  process.exitCode = 1;
});
