import { config as dotenvConfig } from "dotenv";
import { homedir } from "os";
import { join } from "path";

export const FINCHI_HOME = join(homedir(), ".finchi");
export const FINCHI_ENV_PATH = join(FINCHI_HOME, ".env");

// Load ~/.finchi/.env first (lower priority), then CWD .env (override — dev wins)
dotenvConfig({ path: FINCHI_ENV_PATH });
dotenvConfig({ path: join(process.cwd(), ".env"), override: true });

export function getEnvPath(): string {
  return FINCHI_ENV_PATH;
}

export type LLMProviderType = "anthropic" | "openai" | "google" | "openrouter" | "minimax";

export interface Config {
  dbPath: string;
  llmProvider: LLMProviderType;
  llmModel: string;
  llmBaseUrl?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  confidenceThreshold: number;
  similarityThreshold: number;
}

export function loadConfig(): Config {
  return {
    dbPath: process.env.FINCHI_DB_PATH || join(FINCHI_HOME, "finchi.db"),
    llmProvider: (process.env.LLM_PROVIDER as LLMProviderType) || "anthropic",
    llmModel: process.env.LLM_MODEL || defaultModelForProvider((process.env.LLM_PROVIDER as LLMProviderType) || "anthropic"),
    llmBaseUrl: process.env.LLM_BASE_URL || defaultBaseUrl((process.env.LLM_PROVIDER as LLMProviderType) || "anthropic"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    confidenceThreshold: Number(process.env.FINCHI_CONFIDENCE_THRESHOLD || "0.8"),
    similarityThreshold: Number(process.env.FINCHI_SIMILARITY_THRESHOLD || "0.85"),
  };
}

export const LLM_PROVIDERS = [
  { id: "anthropic" as const, name: "Anthropic (Claude)", defaultModel: "claude-sonnet-4-20250514", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai" as const, name: "OpenAI", defaultModel: "gpt-4.1-mini", envKey: "OPENAI_API_KEY" },
  { id: "google" as const, name: "Google (Gemini)", defaultModel: "gemini-2.5-flash-preview-05-20", envKey: "GOOGLE_API_KEY" },
  { id: "openrouter" as const, name: "OpenRouter", defaultModel: "anthropic/claude-sonnet-4", envKey: "OPENAI_API_KEY", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "minimax" as const, name: "MiniMax", defaultModel: "MiniMax-M1", envKey: "OPENAI_API_KEY", baseUrl: "https://api.minimax.chat/v1" },
];

function defaultModelForProvider(provider: LLMProviderType): string {
  return LLM_PROVIDERS.find(p => p.id === provider)?.defaultModel || "claude-sonnet-4-20250514";
}

function defaultBaseUrl(provider: LLMProviderType): string | undefined {
  return LLM_PROVIDERS.find(p => p.id === provider)?.baseUrl;
}

export function getBankCredentials(bankId: string): { rut: string; password: string } | null {
  const prefix = bankId.toUpperCase().replace(/-/g, "_");
  const rut = process.env[`${prefix}_RUT`];
  const password = process.env[`${prefix}_PASS`];
  if (!rut || !password) return null;
  return { rut, password };
}
