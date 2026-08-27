import { Router, type Request, type Response } from 'express';

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'LeadGuard OS V6 Public Developer API',
    version: '1.0.0',
    description:
      'High-performance REST API for LeadGuard OS V6 diagnostic audits, continuous website health monitoring, white-label reports, and webhooks.',
    contact: {
      name: 'LeadGuard Developer Support',
      email: 'developers@leadguard.io',
      url: 'https://leadguard.io/developer/docs',
    },
  },
  servers: [
    {
      url: '/api/v1/public',
      description: 'LeadGuard V6 Public API Base URL',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'LeadGuard API Key (starts with lg_live_)',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Provide API key as Authorization: Bearer <API_KEY>',
      },
    },
    schemas: {
      Audit: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          websiteId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] },
          score: {
            type: 'object',
            properties: {
              overall: { type: 'number' },
              lead: { type: 'number' },
              advertising: { type: 'number' },
              seo: { type: 'number' },
              security: { type: 'number' },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Report: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          status: { type: 'string' },
          pdfStatus: { type: 'string' },
          pdfPath: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Monitor: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          website: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              url: { type: 'string' },
              name: { type: 'string' },
            },
          },
          enabled: { type: 'boolean' },
          frequency: { type: 'string' },
        },
      },
      Testimonial: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          authorName: { type: 'string' },
          companyName: { type: 'string', nullable: true },
          role: { type: 'string', nullable: true },
          content: { type: 'string' },
          rating: { type: 'number' },
          publishedAt: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  paths: {
    '/audits': {
      post: {
        summary: 'Trigger a new diagnostic audit',
        description: 'Requires scope: AUDIT_RUN',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: { type: 'string', format: 'uri' },
                  websiteId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Audit queued successfully' },
          401: { description: 'Unauthorized' },
          429: { description: 'Rate limit exceeded' },
        },
      },
      get: {
        summary: 'List recent diagnostic audits',
        description: 'Requires scope: AUDIT_READ. Supports cursor pagination.',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Audits retrieved successfully' },
        },
      },
    },
    '/audits/{id}': {
      get: {
        summary: 'Get diagnostic audit details and findings',
        description: 'Requires scope: AUDIT_READ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Audit details and findings' },
          404: { description: 'Audit not found' },
        },
      },
    },
    '/reports': {
      get: {
        summary: 'List immutable audit reports',
        description: 'Requires scope: REPORT_READ',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Reports list' },
        },
      },
    },
    '/reports/{id}': {
      get: {
        summary: 'Get immutable report snapshot',
        description: 'Requires scope: REPORT_READ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Report snapshot and metadata' },
        },
      },
    },
    '/monitors': {
      get: {
        summary: 'List configured website health monitors',
        description: 'Requires scope: MONITORING_READ',
        responses: {
          200: { description: 'Monitors list' },
        },
      },
    },
    '/monitors/{id}/status': {
      get: {
        summary: 'Get live status and recent runs for a monitor',
        description: 'Requires scope: MONITORING_READ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Monitor live status' },
        },
      },
    },
    '/monitors/{id}/run': {
      post: {
        summary: 'Trigger an on-demand health check run',
        description: 'Requires scope: MONITORING_RUN',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Check job enqueued' },
        },
      },
    },
    '/testimonials': {
      get: {
        summary: 'Get public approved customer testimonials',
        description: 'Public endpoint (no auth required)',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'clientWorkspaceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Approved testimonials' },
        },
      },
    },
  },
};

export const openApiRouter = Router();

openApiRouter.get('/openapi.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

openApiRouter.get('/docs', (req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LeadGuard OS V6 — API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #0f172a; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { color: #f8fafc; }
    .swagger-ui .info .title { color: #38bdf8; }
    .swagger-ui .scheme-container { background: #1e293b; color: #f8fafc; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/public/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
