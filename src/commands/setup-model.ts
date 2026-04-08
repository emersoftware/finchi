import * as p from "@clack/prompts";
import { writeFileSync, readFileSync, existsSync } from "fs";
import type { Flags } from "../cli";
import type { LLMProviderType } from "../config";
import { upsertEnvLine } from "../flows/setup";

interface ProviderOption {
  id: LLMProviderType;
  name: string;
  models: string[];
  envKey: string;
  baseUrl?: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    models: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250414",
      "claude-opus-4-20250514",
    ],
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ],
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    models: [
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    envKey: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1",
      "google/gemini-2.5-flash-preview",
      "deepseek/deepseek-chat-v3-0324",
      "meta-llama/llama-4-maverick",
    ],
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "minimax",
    name: "MiniMax",
    models: [
      "MiniMax-M1",
      "MiniMax-T1",
    ],
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.minimax.chat/v1",
  },
];

export async function run(_flags: Flags): Promise<void> {
  p.intro("Configurar proveedor de IA");

  // Step 1: Pick provider
  const providerId = await p.select({
    message: "Selecciona el proveedor",
    options: PROVIDERS.map((pr) => ({ value: pr.id, label: pr.name })),
  });
  if (p.isCancel(providerId)) { p.cancel("Cancelado."); return; }

  const provider = PROVIDERS.find((pr) => pr.id === providerId)!;

  // Step 2: Pick model
  const modelOptions = [
    ...provider.models.map((m) => ({ value: m, label: m })),
    { value: "__custom__", label: "Otro (escribir manualmente)" },
  ];

  const modelChoice = await p.select({
    message: "Selecciona el modelo",
    options: modelOptions,
  });
  if (p.isCancel(modelChoice)) { p.cancel("Cancelado."); return; }

  let model = modelChoice as string;
  if (model === "__custom__") {
    const custom = await p.text({
      message: "Escribe el nombre del modelo",
      placeholder: provider.id === "openrouter" ? "ej: qwen/qwen3-235b-a22b" : "ej: mi-modelo-custom",
      validate: (val) => { if (!val?.trim()) return "El modelo es obligatorio"; },
    });
    if (p.isCancel(custom)) { p.cancel("Cancelado."); return; }
    model = custom;
  }

  // Step 3: API key
  const apiKey = await p.password({
    message: `Ingresa tu API key de ${provider.name}`,
  });
  if (p.isCancel(apiKey)) { p.cancel("Cancelado."); return; }

  // Step 4: Save to .env
  const envPath = ".env";
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  content = upsertEnvLine(content, "LLM_PROVIDER", provider.id);
  content = upsertEnvLine(content, "LLM_MODEL", model);
  content = upsertEnvLine(content, provider.envKey, apiKey);
  if (provider.baseUrl) {
    content = upsertEnvLine(content, "LLM_BASE_URL", provider.baseUrl);
  } else {
    content = upsertEnvLine(content, "LLM_BASE_URL", "");
  }
  writeFileSync(envPath, content);

  // Reload into process
  process.env.LLM_PROVIDER = provider.id;
  process.env.LLM_MODEL = model;
  process.env[provider.envKey] = apiKey;
  if (provider.baseUrl) {
    process.env.LLM_BASE_URL = provider.baseUrl;
  } else {
    delete process.env.LLM_BASE_URL;
  }

  p.log.success(`Proveedor: ${provider.name}`);
  p.log.success(`Modelo: ${model}`);
  p.outro("Configuracion guardada! Ejecuta 'finchi categorize' para categorizar.");
}
