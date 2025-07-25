import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {spawn} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export enum TaskType {
    Code = 'code',
    Text = 'text'
}

export enum AIProvider {
    Codex = 'codex',
    ClaudeCode = 'claudecode'
}

export interface AIResponse {
    content: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
}

export interface GenerateRequest {
    taskType: TaskType;
    aiProvider: AIProvider;
    apiKey: string;
    prompt: string;
    model?: string;
    workspacePath?: string;
}

export class AIService {
    private anthropic: Anthropic | null = null;
    private openai: OpenAI | null = null;

    private readonly DEFAULT_OPENAI_MODEL = 'codex-mini-latest';
    private readonly DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
    private readonly DEFAULT_OPENAI_API_MODEL = 'gpt-4o-mini';

    private readonly VALID_OPENAI_MODELS = [
        'codex-mini-latest', 'o4-mini'
    ];

    private readonly VALID_ANTHROPIC_MODELS = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-3-7-sonnet-20250219'
    ];

    private initAnthropic(apiKey: string): void {
        if (!this.anthropic) {
            this.anthropic = new Anthropic({
                apiKey: apiKey,
            });
        }
    }

    private initOpenAI(apiKey: string): void {
        if (!this.openai) {
            this.openai = new OpenAI({
                apiKey: apiKey,
            });
        }
    }

    validateAnthropicKey(apiKey: string): boolean {
        return apiKey.startsWith('sk-ant-');
    }

    validateOpenAIKey(apiKey: string): boolean {
        return apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-');
    }



    async generate(request: GenerateRequest): Promise<AIResponse> {
        if (request.taskType === TaskType.Code) {
            return this.generateCode(request);
        } else if (request.taskType === TaskType.Text) {
            return this.generateText(request);
        } else {
            throw new Error(`Unsupported task type: ${request.taskType}`);
        }
    }

    detectAIProvider(apiKey: string): AIProvider {
        if (this.validateAnthropicKey(apiKey)) {
            return AIProvider.ClaudeCode;
        }
        if (this.validateOpenAIKey(apiKey)) {
            return AIProvider.Codex;
        }
        throw new Error('Unknown API key format');
    }

    private async generateCode(request: GenerateRequest): Promise<AIResponse> {
        if (request.aiProvider === AIProvider.ClaudeCode) {
            return this.generateCodeWithClaudeCodeCLI(request.apiKey, request.prompt, request.workspacePath, request.model);
        } else if (request.aiProvider === AIProvider.Codex) {
            return this.generateCodeWithCodexCLI(request.apiKey, request.prompt, request.workspacePath, request.model);
        } else {
            throw new Error(`Unsupported AI provider for code generation: ${request.aiProvider}`);
        }
    }

    private async generateText(request: GenerateRequest): Promise<AIResponse> {
        if (request.aiProvider === AIProvider.ClaudeCode) {
            return this.generateTextWithClaude(request.apiKey, request.prompt, request.model);
        } else if (request.aiProvider === AIProvider.Codex) {
            return this.generateTextWithOpenAI(request.apiKey, request.prompt, request.model);
        } else {
            throw new Error(`Unsupported AI provider for text generation: ${request.aiProvider}`);
        }
    }

    private async generateTextWithClaude(apiKey: string, prompt: string, model?: string): Promise<AIResponse> {
        try {
            this.initAnthropic(apiKey);

            const response = await this.anthropic!.messages.create({
                model: this.validateAndGetAnthropicModel(model),
                max_tokens: 500,
                temperature: 0.1,
                messages: [{role: 'user', content: prompt}]
            });

            const content = response.content[0].type === 'text' ? response.content[0].text : '';
            const usage = response.usage;

            return {
                content,
                usage: {
                    inputTokens: usage.input_tokens,
                    outputTokens: usage.output_tokens,
                    totalTokens: usage.input_tokens + usage.output_tokens,
                },
            };
        } catch (error) {
            console.error('Error with Anthropic API:', error);
            throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async generateTextWithOpenAI(apiKey: string, prompt: string, model?: string): Promise<AIResponse> {
        try {
            this.initOpenAI(apiKey);

            const validatedModel = this.validateAndGetOpenAIAPIModel(model);
            const completion = await this.openai!.chat.completions.create({
                model: validatedModel,
                messages: [{ role: 'user', content: prompt }],
                max_completion_tokens: 500,
                temperature: 0.1,
            });

            const content = completion.choices[0].message?.content || '';
            const usage = completion.usage;

            return {
                content,
                usage: {
                    inputTokens: usage?.prompt_tokens || 0,
                    outputTokens: usage?.completion_tokens || 0,
                    totalTokens: usage?.total_tokens || 0,
                },
            };
        } catch (error) {
            console.error('Error with OpenAI API:', error);
            throw new Error(`Failed to generate text with OpenAI: ${error instanceof Error ? error.message : 'Unknown OpenAI error'}`);
        }
    }

    async generateCodeWithClaudeCodeCLI(apiKey: string, prompt: string, workspacePath?: string, model?: string): Promise<AIResponse> {
        const targetWorkspacePath = workspacePath || process.cwd();
        const claudeFilePath = path.join(targetWorkspacePath, 'CLAUDE.md');
        const sourceClaudeFilePath = path.join(__dirname, '..', 'prompts', 'CLAUDE.md');
        let claudeFileCopied = false;

        try {
            if (!this.validateAnthropicKey(apiKey)) {
                throw new Error('Invalid Anthropic API key format. Must start with sk-ant-');
            }

            const sanitizedPrompt = this.sanitizePrompt(prompt);
            const selectedModel = this.validateAndGetAnthropicModel(model);

            if (fs.existsSync(sourceClaudeFilePath)) {
                try {
                    const claudeContent = fs.readFileSync(sourceClaudeFilePath, 'utf-8');
                    fs.writeFileSync(claudeFilePath, claudeContent);
                    claudeFileCopied = true;
                    console.log('✅ Copied CLAUDE.md to working directory');
                } catch (copyError) {
                    console.warn('⚠️  Failed to copy CLAUDE.md to working directory:', copyError);
                }
            }

            const result = await this.executeCLICommand('claude', ['-p', '--dangerously-skip-permissions'], {
                input: sanitizedPrompt,
                env: {
                    ANTHROPIC_API_KEY: apiKey,
                    ANTHROPIC_MODEL: selectedModel,
                },
                cwd: targetWorkspacePath,
                timeout: 1000000
            });

            if (result.exitCode !== 0) {
                console.error('❌ Claude CLI failed:', {
                    exitCode: result.exitCode,
                    stderr: result.stderr,
                    stdout: result.stdout
                });
                throw new Error(`Claude CLI failed with exit code ${result.exitCode}: ${result.stderr}`);
            }

            console.log('✅ Claude Code CLI completed successfully');
            const estimatedInputTokens = Math.ceil(prompt.length / 4);
            const estimatedOutputTokens = Math.ceil(result.stdout.length / 4);
            const totalTokens = estimatedInputTokens + estimatedOutputTokens;

            return {
                content: result.stdout.trim(),
                usage: {
                    inputTokens: estimatedInputTokens,
                    outputTokens: estimatedOutputTokens,
                    totalTokens
                },
            };
        } catch (error) {
            console.error('Error with Claude Code CLI:', error);
            throw new Error(`Claude Code CLI error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            if (claudeFileCopied && fs.existsSync(claudeFilePath)) {
                try {
                    fs.unlinkSync(claudeFilePath);
                    console.log('✅ Cleaned up CLAUDE.md from working directory');
                } catch (cleanupError) {
                    console.warn('⚠️  Failed to clean up CLAUDE.md from working directory:', cleanupError);
                }
            }
        }
    }

    async generateCodeWithCodexCLI(apiKey: string, prompt: string, workspacePath?: string, model?: string): Promise<AIResponse> {
        try {
            if (!this.validateOpenAIKey(apiKey)) {
                throw new Error('Invalid OpenAI API key format. Must start with sk-');
            }

            const sanitizedPrompt = this.sanitizePrompt(prompt);
            const selectedModel = this.validateAndGetOpenAIModel(model);

            const codexArgs = ['-q', '-a', 'auto-edit'];
            if (selectedModel) {
                codexArgs.push('-m', selectedModel);
            }
            codexArgs.push(sanitizedPrompt);

            const result = await this.executeCLICommand('codex', codexArgs, {
                env: {
                    OPENAI_API_KEY: apiKey,
                },
                cwd: workspacePath || process.cwd(),
                timeout: 1000000
            });

            if (result.exitCode !== 0) {
                console.error('❌ Codex CLI failed with exit code:', result.exitCode);
                console.error('📥 STDERR:', result.stderr);
                throw new Error(`Codex CLI failed with exit code ${result.exitCode}. Stderr: ${result.stderr}. Stdout: ${result.stdout}`);
            }

            console.log('✅ Codex CLI completed successfully');
            return {
                content: result.stdout,
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                },
            };
        } catch (error) {
            console.error('❌ Error in generateCodeWithCodexCLI:', error);
            throw new Error(`Codex CLI error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async executeCLICommand(
        command: string,
        args: string[],
        options: {
            input?: string;
            env?: Record<string, string>;
            cwd?: string;
            timeout?: number;
        }
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                cwd: options.cwd,
                env: {
                    ...process.env,
                    ...options.env,
                    CI: 'true',
                    NODE_ENV: 'production',
                    FORCE_COLOR: '0',
                    NO_COLOR: '1'
                },
                stdio: options.input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            let isResolved = false;

            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    child.kill('SIGTERM');
                    reject(new Error(`Command timeout after ${options.timeout}ms`));
                }
            }, options.timeout || 300000);

            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
            });

            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
            });

            child.on('close', (exitCode) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    resolve({
                        stdout,
                        stderr,
                        exitCode: exitCode || 0
                    });
                }
            });

            child.on('error', (error) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    reject(new Error(`Failed to start process: ${error.message}`));
                }
            });

            if (options.input && child.stdin) {
                child.stdin.write(options.input);
                child.stdin.end();
            }
        });
    }

    private sanitizePrompt(prompt: string): string {
        try {
            let sanitized = prompt.replace(/\uFFFD/g, '');

            sanitized = sanitized.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');
            sanitized = sanitized.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
            const buffer = Buffer.from(sanitized, 'utf-8');
            return buffer.toString('utf-8');
        } catch (error) {
            console.warn('⚠️  Error sanitizing prompt, using original:', error);
            return prompt;
        }
    }

    private validateAndGetModel(model: string | undefined, provider: 'openai' | 'anthropic'): string {
        const validModels = provider === 'openai' ? this.VALID_OPENAI_MODELS : this.VALID_ANTHROPIC_MODELS;
        const defaultModel = provider === 'openai' ? this.DEFAULT_OPENAI_MODEL : this.DEFAULT_ANTHROPIC_MODEL;
        
        if (!model || model === 'default') {
            return defaultModel;
        }
        
        if (!validModels.includes(model)) {
            console.warn(`Invalid ${provider} model '${model}', using default: ${defaultModel}`);
            return defaultModel;
        }
        
        return model;
    }

    private validateAndGetOpenAIModel(model?: string): string {
        return this.validateAndGetModel(model, 'openai');
    }

    private validateAndGetOpenAIAPIModel(model?: string): string {
        const validModels = this.VALID_OPENAI_MODELS;
        const defaultModel = this.DEFAULT_OPENAI_API_MODEL;
        
        if (!model || model === 'default') {
            return defaultModel;
        }
        
        if (!validModels.includes(model)) {
            console.warn(`Invalid OpenAI API model '${model}', using default: ${defaultModel}`);
            return defaultModel;
        }
        
        return model;
    }

    private validateAndGetAnthropicModel(model?: string): string {
        return this.validateAndGetModel(model, 'anthropic');
    }

    getAvailableModels(): { openai: string[], anthropic: string[] } {
        return {
            openai: [...this.VALID_OPENAI_MODELS],
            anthropic: [...this.VALID_ANTHROPIC_MODELS]
        };
    }
} 