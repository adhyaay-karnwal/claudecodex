import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerSpecs from './config/swagger.config';
import routes from './routes';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow Swagger UI to work
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files serving
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../../frontend/dist/assets')));
app.use('/favicon.ico', express.static(path.join(__dirname, '../public/favicon.ico')));

// Serve frontend build files
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
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

// API Routes
app.use('/api', routes);

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    service: 'ClaudeCodex API'
  });
});

// Serve frontend for all non-API routes (SPA support)
app.get('*', (req: Request, res: Response) => {
  // If it's an API route, return 404 JSON
  if (req.path.startsWith('/api')) {
    res.status(404).json({ 
      success: false,
      error: 'API route not found',
      path: req.originalUrl,
      suggestion: 'Check /api-docs for available endpoints'
    });
    return;
  }

  // For all other routes, serve the frontend index.html (SPA)
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

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.stack);
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

export default app; 