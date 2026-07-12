import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Ollama runs on the Windows host (GPU access), not inside a container —
// host.docker.internal is Docker Desktop's DNS name for reaching the host
// from a container. Override via OLLAMA_BASE_URL for other setups.
const DEFAULT_BASE_URL = 'http://host.docker.internal:11434';
const DEFAULT_MODEL = 'qwen2.5:14b-instruct';
const GENERATE_TIMEOUT_MS = 120_000; // local 14B inference on a single GPU can take a while

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

@Injectable()
export class OllamaClient {
  private readonly logger = new Logger(OllamaClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get('OLLAMA_BASE_URL', DEFAULT_BASE_URL);
  }

  private get model(): string {
    return this.config.get('OLLAMA_MODEL', DEFAULT_MODEL);
  }

  /** Sends a prompt, forcing valid-JSON output (Ollama's `format: "json"`), and parses it as T. */
  async generateJson<T>(prompt: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    try {
      this.logger.log(`Generating with ${this.model}...`);
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, format: 'json', stream: false }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama responded ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as OllamaGenerateResponse;
      return JSON.parse(data.response) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
