import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { CrmController, ownerId } from './crm.controller';
import { CrmService } from './crm.service';
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
    res
      .status(status)
      .json({
        code: `HTTP_${status}`,
        message:
          status >= 500
            ? 'Service unavailable. Check System activity and try again.'
            : typeof detail === 'string'
              ? detail
              : 'Request failed.',
        ...(detail && typeof detail === 'object' ? detail : {}),
        requestId: req.requestId,
      });
  }
}
@Module({ controllers: [CrmController], providers: [Database, CrmService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '128kb' });
  const db = app.get(Database);
  await db.$connect();
  const salt = randomBytes(16);
  const passwordHash = scryptSync(settings.OWNER_PASSWORD, salt, 32);
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
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 12 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
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
    if (!req.session.ownerId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Sign in to your private workspace.' });
      return;
    }
    next();
  });
  const express = app.getHttpAdapter().getInstance();
  express.post(
    '/api/v1/auth/login',
    rateLimit({ windowMs: 60000, limit: 10 }),
    (req: Request, res: Response) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length > 200 || !timingSafeEqual(scryptSync(password, salt, 32), passwordHash)) {
        res.status(401).json({ message: 'Incorrect password.' });
        return;
      }
      req.session.regenerate((error) => {
        if (error) {
          res.status(503).json({ message: 'Session storage unavailable.' });
          return;
        }
        req.session.ownerId = ownerId;
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
        worker: 'not configured',
        ai: 'not configured',
      });
    } catch {
      res
        .status(503)
        .json({
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
