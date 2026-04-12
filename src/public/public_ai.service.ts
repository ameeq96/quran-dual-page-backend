import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as http from 'http';
import * as https from 'https';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { AppSetting } from '../entities/app_setting.entity';

type AdminAiRunRequest = {
  tool: string;
  toolTitle: string;
  toolInstruction: string;
  userInput: string;
  responseLanguage: string;
  responseDepth: string;
  contextPromptBlock: string;
};

type NormalizedProvider = 'local' | 'ollama' | 'openai' | 'custom';

type RuntimeConfig = {
  provider: NormalizedProvider;
  providerLabel: string;
  model: string;
  endpoint: string;
  secret: string;
  statusLabel: string;
  systemPrompt: string;
  customHeaders: Record<string, string>;
};

const HTTP_KEEP_ALIVE_AGENT = new http.Agent({
  keepAlive: true,
  maxSockets: 32,
});

const HTTPS_KEEP_ALIVE_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
});

@Injectable()
export class PublicAiService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingsRepo: Repository<AppSetting>,
    private readonly cache: MemoryCacheService,
  ) {}

  async runTool(request: AdminAiRunRequest) {
    if (!request.tool?.trim()) {
      throw new BadRequestException('tool is required');
    }

    const config = await this.loadRuntimeConfig();
    if (config.provider === 'local') {
      return {
        configured: false,
        provider: config.provider,
        providerLabel: config.providerLabel,
        statusLabel: config.statusLabel || 'AI provider is set to local mode.',
      };
    }

    const systemPrompt = [
      'You are an AI assistant inside a Quran study app.',
      'Use only the provided Quran page context and request details.',
      'Do not invent unsupported tafsir, fiqh rulings, or historical claims.',
      'If the available page context is limited, state that clearly.',
      'Keep answers structured, concise, and practical.',
      config.systemPrompt,
    ]
      .filter((entry) => entry.trim().length > 0)
      .join('\n');

    const trimmedInstruction = request.toolInstruction?.trim() ?? '';
    const trimmedUserInput = request.userInput?.trim() ?? '';
    const trimmedContext = request.contextPromptBlock?.trim() ?? '';

    const userPrompt = [
      `Tool: ${request.toolTitle?.trim() || request.tool}`,
      `Instruction: ${trimmedInstruction || 'Help with the current Quran page.'}`,
      `Response language: ${request.responseLanguage?.trim() || 'english'}`,
      `Response depth: ${request.responseDepth?.trim() || 'fast'}`,
      trimmedUserInput.length === 0
        ? 'User request: Focus on the current page only.'
        : `User request: ${trimmedUserInput}`,
      '',
      trimmedContext,
    ]
      .filter((entry) => entry.trim().length > 0)
      .join('\n');

    const output = await this.runProvider(config, systemPrompt, userPrompt);
    if (!output.trim()) {
      return {
        configured: false,
        provider: config.provider,
        providerLabel: config.providerLabel,
        statusLabel: 'AI provider returned an empty response.',
      };
    }

    return {
      configured: true,
      output: output.trim(),
      sourceLabel: `${config.providerLabel} ${config.model}`.trim(),
      provider: config.provider,
      providerLabel: config.providerLabel,
      model: config.model,
      endpoint: config.endpoint,
      statusLabel: config.statusLabel,
      usedOnlineModel: true,
    };
  }

  private async runProvider(
    config: RuntimeConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    switch (config.provider) {
      case 'ollama':
        return this.runOllama(config, systemPrompt, userPrompt);
      case 'openai':
        return this.runOpenAi(config, systemPrompt, userPrompt);
      case 'custom':
        return this.runCustom(config, systemPrompt, userPrompt);
      case 'local':
      default:
        return '';
    }
  }

  private async runOllama(
    config: RuntimeConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const endpoint = this.normalizeBaseUrl(
      config.endpoint || 'http://127.0.0.1:11434',
    );
    const payload = {
      model: config.model || 'qwen2.5:1.5b-instruct',
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
    };

    const response = await this.postJson(`${endpoint}/api/generate`, payload, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.customHeaders,
    });

    return this.extractGeneratedText(response.body);
  }

  private async runOpenAi(
    config: RuntimeConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (!config.secret.trim()) {
      throw new BadRequestException('ai_secret is required for OpenAI provider.');
    }

    const endpoint =
      config.endpoint.trim().length === 0
        ? 'https://api.openai.com/v1/responses'
        : config.endpoint.trim();

    const payload = {
      model: config.model || 'gpt-4o-mini',
      instructions: systemPrompt,
      input: userPrompt,
    };

    const response = await this.postJson(endpoint, payload, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.secret}`,
      ...config.customHeaders,
    });

    return this.extractGeneratedText(response.body);
  }

  private async runCustom(
    config: RuntimeConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (!config.endpoint.trim()) {
      throw new BadRequestException('ai_endpoint is required for custom provider.');
    }

    const payload = {
      model: config.model,
      system: systemPrompt,
      prompt: userPrompt,
      input: userPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.customHeaders,
    };
    if (config.secret.trim().length > 0) {
      headers.Authorization = `Bearer ${config.secret}`;
    }

    const response = await this.postJson(config.endpoint.trim(), payload, headers);
    return this.extractGeneratedText(response.body);
  }

  private async loadRuntimeConfig(): Promise<RuntimeConfig> {
    return this.cache.getOrSet('public-ai:runtime-config', 15_000, async () => {
      const settings = await this.settingsRepo.find();
      const values = new Map(settings.map((entry) => [entry.key, entry.value]));
      const rawProvider = (values.get('ai_provider') ?? 'local').trim();
      const provider = this.normalizeProvider(rawProvider);

      return {
        provider,
        providerLabel: this.providerLabel(provider, rawProvider),
        model: (values.get('ai_model') ?? '').trim(),
        endpoint: (values.get('ai_endpoint') ?? '').trim(),
        secret: (values.get('ai_secret') ?? '').trim(),
        statusLabel: (values.get('ai_status_label') ?? '').trim(),
        systemPrompt: (values.get('ai_system_prompt') ?? '').trim(),
        customHeaders: this.parseCustomHeaders(
          values.get('ai_custom_headers_json') ?? '',
        ),
      };
    });
  }

  private normalizeProvider(rawProvider: string): NormalizedProvider {
    switch (rawProvider.trim().toLowerCase()) {
      case 'ollama':
        return 'ollama';
      case 'openai':
      case 'chatgpt':
        return 'openai';
      case 'custom':
        return 'custom';
      default:
        return 'local';
    }
  }

  private providerLabel(
    provider: NormalizedProvider,
    rawProvider: string,
  ): string {
    const normalized = rawProvider.trim().toLowerCase();
    if (normalized.length > 0) {
      switch (normalized) {
        case 'ollama':
          return 'Ollama';
        case 'openai':
        case 'chatgpt':
          return 'ChatGPT';
        case 'custom':
          return 'Custom AI';
        default:
          return rawProvider.trim();
      }
    }

    switch (provider) {
      case 'ollama':
        return 'Ollama';
      case 'openai':
        return 'ChatGPT';
      case 'custom':
        return 'Custom AI';
      case 'local':
      default:
        return 'Local assistant';
    }
  }

  private normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (trimmed.endsWith('/')) {
      return trimmed.slice(0, -1);
    }
    return trimmed;
  }

  private parseCustomHeaders(rawValue: string): Record<string, string> {
    if (rawValue.trim().length === 0) {
      return {};
    }

    try {
      const decoded = JSON.parse(rawValue) as unknown;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        return {};
      }

      const record = decoded as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, String(value)]),
      );
    } catch {
      return {};
    }
  }

  private async postJson(
    urlString: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<{ statusCode: number; body: unknown }> {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const request = client.request(
        url,
        {
          method: 'POST',
          agent:
            url.protocol === 'https:' ? HTTPS_KEEP_ALIVE_AGENT : HTTP_KEEP_ALIVE_AGENT,
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(payload).toString(),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const parsed = this.safeJsonParse(text);
            const statusCode = response.statusCode ?? 500;

            if (statusCode < 200 || statusCode >= 300) {
              reject(
                new BadRequestException(
                  `AI provider request failed with status ${statusCode}.`,
                ),
              );
              return;
            }

            resolve({ statusCode, body: parsed });
          });
        },
      );

      request.on('error', (error) => reject(error));
      request.setTimeout(90000, () => {
        request.destroy(new Error('AI provider request timed out.'));
      });
      request.write(payload);
      request.end();
    });
  }

  private safeJsonParse(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private extractGeneratedText(body: unknown): string {
    if (typeof body === 'string') {
      return body;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return '';
    }

    const record = body as Record<string, unknown>;

    if (typeof record.response === 'string') {
      return record.response;
    }
    if (typeof record.output_text === 'string') {
      return record.output_text;
    }
    if (typeof record.text === 'string') {
      return record.text;
    }

    const choices = Array.isArray(record.choices) ? record.choices : [];
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        continue;
      }

      const choiceRecord = choice as Record<string, unknown>;
      const message = choiceRecord.message;
      if (message && typeof message === 'object' && !Array.isArray(message)) {
        const messageRecord = message as Record<string, unknown>;
        const content = messageRecord.content;

        if (typeof content === 'string') {
          return content;
        }

        if (Array.isArray(content)) {
          const contentText = content
            .filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item),
            )
            .map((item) => (typeof item.text === 'string' ? item.text : ''))
            .filter((text) => text.length > 0)
            .join('\n')
            .trim();

          if (contentText.length > 0) {
            return contentText;
          }
        }
      }

      if (typeof choiceRecord.text === 'string') {
        return choiceRecord.text;
      }
    }

    const output = Array.isArray(record.output) ? record.output : [];
    const outputTextParts: string[] = [];

    for (const item of output) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const itemRecord = item as Record<string, unknown>;
      const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

      for (const contentItem of content) {
        if (
          !contentItem ||
          typeof contentItem !== 'object' ||
          Array.isArray(contentItem)
        ) {
          continue;
        }

        const contentRecord = contentItem as Record<string, unknown>;
        if (typeof contentRecord.text === 'string') {
          outputTextParts.push(contentRecord.text);
        }
      }
    }

    return outputTextParts.join('\n').trim();
  }
}
