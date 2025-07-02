import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ClaudeCodex API',
      version: '1.0.0',
      description: `
  🤖 **AI-Powered Code Generation API**
    
    This API enables automatic code generation and GitHub integration using ClaudeCode and Codex.
    
    - **🤖 Execute**: \`POST /api/dev/execute\` - Complete AI workflow (branch creation, code generation, PR creation)
    - **🏥 Health**: \`GET /api/health\` - Health check
    - **🔐 Auth**: \`POST /api/github/auth\` - GitHub OAuth
    - **🌿 Branches**: \`POST /api/github/branches\` - Get repository branches
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.bgcode.com',
        description: 'Production server'
      }
    ],
    components: {
      schemas: {
        GitHubAuthRequest: {
          type: 'object',
          required: ['code', 'client_id', 'redirect_uri'],
          properties: {
            code: {
              type: 'string',
              description: 'GitHub OAuth authorization code',
              example: 'gho_xxxxxxxxxxxxxxxxxxxx'
            },
            client_id: {
              type: 'string',
              description: 'GitHub OAuth client ID',
              example: 'Iv1.a629723000000000'
            },
            redirect_uri: {
              type: 'string',
              description: 'OAuth redirect URI',
              example: 'http://localhost:3000/auth/callback'
            }
          }
        },
        GitHubAuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the operation was successful'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            data: {
              type: 'object',
              properties: {
                access_token: {
                  type: 'string',
                  description: 'GitHub access token'
                }
              }
            }
          }
        },
        ExecuteRequest: {
          type: 'object',
          required: ['prompt', 'githubUrl'],
          properties: {
            prompt: {
              type: 'string',
              description: 'Description of changes to make',
              example: 'Add a new feature to calculate user statistics'
            },
            apiKey: {
              type: 'string',
              description: 'Anthropic (sk-ant-) or OpenAI (sk-) API key. System automatically detects provider based on key prefix.',
              example: 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx'
            },
            model: {
              type: 'string',
              description: 'AI model to use (optional). Defaults: claude-sonnet-4-20250514 for Anthropic, codex-1 for OpenAI',
              example: 'claude-sonnet-4-20250514',
              enum: [
                'claude-sonnet-4-20250514',
                'claude-opus-4-20250514',
                'claude-3.7-sonnet-20250219',
                'codex-1',
                'codex-mini-latest'
              ]
            },
            githubUrl: {
              type: 'string',
              description: 'GitHub repository URL',
              example: 'https://github.com/username/repository'
            },
            githubToken: {
              type: 'string',
              description: 'GitHub access token (optional - can be provided via GITHUB_TOKEN environment variable)',
              example: 'ghp_xxxxxxxxxxxxxxxxxxxx'
            },
            files: {
              type: 'array',
              items: {
                type: 'string',
                format: 'binary'
              },
              description: 'Optional files to include in the request (max 10 files, 10MB each)'
            }
          }
        },
        ExecuteResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the operation was successful'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            data: {
              type: 'object',
              properties: {
                pullRequestUrl: {
                  type: 'string',
                  description: 'URL of the created pull request',
                  example: 'https://github.com/username/repo/pull/123'
                },
                branchName: {
                  type: 'string',
                  description: 'Name of the created branch',
                  example: 'add-user-statistics-feature'
                },
                pullRequestNumber: {
                  type: 'number',
                  description: 'Pull request number',
                  example: 123
                },
                processedAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'When the request was processed'
                },
                repositoryName: {
                  type: 'string',
                  description: 'Repository name',
                  example: 'my-awesome-project'
                },
                repositoryOwner: {
                  type: 'string',
                  description: 'Repository owner',
                  example: 'username'
                }
              }
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the operation was successful'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            data: {
              type: 'object',
              description: 'Response data (varies by endpoint)'
            },
            error: {
              type: 'string',
              description: 'Error message (if any)'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'OK'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds'
            },
            version: {
              type: 'string',
              example: '1.0.0'
            },
            service: {
              type: 'string',
              example: 'ClaudeCodex API'
            },
            environment: {
              type: 'string',
              example: 'development'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Core',
        description: '🤖 Main AI-powered code generation workflow'
      },
      {
        name: 'GitHub',
        description: '🔐 GitHub authentication and repository operations'
      },
      {
        name: 'System',
        description: '🏥 System health and API information'
      }
    ]
  },
  apis: ['./src/routes/*.ts', './src/index.ts'],
};

const specs = swaggerJsdoc(options);
export default specs; 