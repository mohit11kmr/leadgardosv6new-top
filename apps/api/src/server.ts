import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { config } from '@leadguard/config';
import { db } from '@leadguard/database';
import { apiRouter } from './routes.js';
import { redactSensitive } from './services/redactService.js';
import { apiLimiter } from './middleware/rateLimiters.js';

export const app = express();
const redis = new Redis(config.REDIS_URL);

// Trust reverse proxies in production
app.set('trust proxy', 1);

// Structured logging with sensitive data redaction (Requirement 28)
app.use((request, response, next) => {
  const requestId = request.header('x-request-id') ?? randomUUID();
  response.setHeader('x-request-id', requestId);
  const startedAt = Date.now();

  response.on('finish', () => {
    const logData = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'api',
      requestId,
      route: request.path,
      method: request.method,
      status: response.statusCode,
      duration: Date.now() - startedAt,
    };
    console.log(JSON.stringify(redactSensitive(logData)));
  });

  next();
});

// Production Security Headers with Helmet (Requirement 15)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.API_URL, config.APP_URL, 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts:
      config.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Production-safe CORS with explicit origins & credentials (Requirement 13)
const allowedOrigins = [
  ...config.CORS_ORIGINS.split(',').map((v) => v.trim()),
  config.APP_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

// Preserve raw body buffer for Webhook signature verification (Requirement 14)
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: string }).rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global baseline API rate limiter
app.use('/api/v1', apiLimiter);

// Liveness & Readiness Probes
app.get('/health', (_request, response) => response.json({ success: true, data: { status: 'ok' } }));

app.get('/ready', async (request, response) => {
  try {
    await db.$queryRaw`SELECT 1`;
    await redis.ping();
    response.json({ success: true, data: { status: 'ready', postgres: 'ok', redis: 'ok' } });
  } catch {
    response.status(503).json({
      success: false,
      error: { code: 'NOT_READY', message: 'Dependencies unavailable', requestId: request.header('x-request-id') ?? '' },
    });
  }
});

// API Routes
app.use('/api/v1', apiRouter);

// Global Error Handler with Redaction (Requirement 27)
app.use(
  (
    error: unknown,
    request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    const isValidation = error instanceof Error && error.name === 'ZodError';
    const isCors = error instanceof Error && error.message.includes('CORS');

    const errPayload = {
      level: 'error',
      service: 'api',
      requestId: request.header('x-request-id'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    console.error(JSON.stringify(redactSensitive(errPayload)));

    if (isCors) {
      return response.status(403).json({
        success: false,
        error: { code: 'CORS_ERROR', message: 'Not allowed by CORS', requestId: request.header('x-request-id') ?? '' },
      });
    }

    response.status(isValidation ? 400 : 500).json({
      success: false,
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: isValidation ? 'Request validation failed' : 'An unexpected error occurred',
        requestId: request.header('x-request-id') ?? '',
      },
    });
  }
);

if (config.NODE_ENV !== 'test') {
  const server = app.listen(config.PORT, () => console.log(`LeadGuard API listening on ${config.PORT}`));

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        await redis.quit();
        await db.$disconnect();
        console.log('Database and Redis connections closed. Exiting process.');
        process.exit(0);
      } catch (err: any) {
        console.error('Error during dependency disconnect:', err.message);
        process.exit(1);
      }
    });

    // Force exit after 10 seconds if hanging
    setTimeout(() => {
      console.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
