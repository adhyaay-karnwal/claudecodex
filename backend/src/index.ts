import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { getSwaggerSpecs } from './config/swagger.config';
import routes from './routes';
import path from 'path';
import compression from 'compression';
import morgan from 'morgan';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import { body } from 'express-validator';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept'],
  maxAge: 86400
};

app.use(cors(corsOptions));

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({
  limit: '10mb',
  type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 20
}));
app.use(cookieParser());

app.use(mongoSanitize());
app.use(hpp({
  whitelist: ['sort', 'fields', 'page', 'limit']
}));

if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    skip: (req) => req.path.startsWith('/api-docs') || req.path === '/favicon.ico'
  }));
} else {
  app.use(morgan('dev', {
    skip: (req) => req.path.startsWith('/api-docs') || req.path === '/favicon.ico'
  }));
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/health' || req.path.startsWith('/static');
  }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many API requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true,
});

app.use(generalLimiter);

app.use('/static', express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  etag: true
}));
app.use('/assets', express.static(path.join(__dirname, '../../frontend/dist/assets'), {
  maxAge: '1y',
  etag: true
}));
app.use('/favicon.ico', express.static(path.join(__dirname, '../public/favicon.ico'), {
  maxAge: '1d'
}));

const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath, {
  maxAge: '1h',
  etag: true
}));

const validateContentType = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.get('Content-Type');
    if (!contentType || (!contentType.includes('application/json') &&
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('application/x-www-form-urlencoded'))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Content-Type. Expected application/json, multipart/form-data, or application/x-www-form-urlencoded'
      });
    }
  }
  next();
};

const validateApiKey = body('apiKey')
  .optional()
  .isLength({ min: 10 })
  .withMessage('API key must be at least 10 characters')
  .matches(/^sk-/)
  .withMessage('Invalid API key format');

const validateGitHubToken = body('githubToken')
  .optional()
  .isLength({ min: 10 })
  .withMessage('GitHub token must be at least 10 characters')
  .matches(/^gh[ps]_/)
  .withMessage('Invalid GitHub token format');

const validateGitHubUrl = body('githubUrl')
  .optional()
  .isURL()
  .withMessage('Invalid GitHub URL')
  .contains('github.com')
  .withMessage('URL must be a GitHub repository');

// Custom logging middleware removed - using Morgan instead

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (req, res) => {
  const dynamicSpecs = getSwaggerSpecs(req);
  res.send(swaggerUi.generateHTML(dynamicSpecs, {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info hgroup.main h2 { color: #3b82f6 }
      .swagger-ui .info .title { color: #1f2937; font-size: 36px; }
      .swagger-ui .scheme-container { background: #f8fafc; padding: 15px; border-radius: 8px; }
    `,
    customSiteTitle: '🤖 ClaudeCodex API',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha'
    }
  }));
});

app.use('/api', apiLimiter, validateContentType, routes);

app.use('/api/github/auth', authLimiter);
app.use('/api/*/execute', authLimiter);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: 🏥 System health check
 *     description: Returns the current health status of the API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: ✅ System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: "OK"
 *               timestamp: "2024-01-15T10:30:00.000Z"
 *               uptime: 3600
 *               version: "1.0.0"
 *               service: "ClaudeCodex API"
 *               environment: "development"
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    service: 'ClaudeCodex API',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      error: 'API route not found',
      path: req.originalUrl,
      suggestion: 'Check /api-docs for available endpoints'
    });
    return;
  }

  const indexPath = path.join(frontendDistPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: '🤖 ClaudeCodex API is running!',
      version: '1.0.0',
      docs: '/api-docs',
      api: '/api',
      note: 'Frontend not built yet. Run "npm run build" in the frontend directory.'
    });
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.message
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      details: err.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ClaudeCodex backend is running on port ${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/api-docs`);
  console.log(`🔗 API endpoints available at http://localhost:${PORT}/api`);

});