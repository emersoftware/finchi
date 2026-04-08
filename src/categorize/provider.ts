import type { Config } from "../config";

export interface LLMProvider {
  classify(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** Factory that creates the appropriate LLM provider based on config. */
export function createProvider(config: Config): LLMProvider {
  switch (config.llmProvider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
    case "openrouter":
    case "minimax":
      return new OpenAIProvider(config);
    case "google":
      return new GoogleProvider(config);
    default:
      throw new Error(`Proveedor LLM no soportado: ${config.llmProvider}`);
  }
}

class AnthropicProvider implements LLMProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async classify(systemPrompt: string, userPrompt: string): Promise<string> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: this.config.anthropicApiKey });

    const response = await client.messages.create({
      model: this.config.llmModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Respuesta vacía del modelo Anthropic");
    }
    return textBlock.text;
  }
}

class OpenAIProvider implements LLMProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async classify(systemPrompt: string, userPrompt: string): Promise<string> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: this.config.openaiApiKey,
      ...(this.config.llmBaseUrl && { baseURL: this.config.llmBaseUrl }),
    });

    const response = await client.chat.completions.create({
      model: this.config.llmModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Respuesta vacía del modelo OpenAI");
    }
    return content;
  }
}

class GoogleProvider implements LLMProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async classify(systemPrompt: string, userPrompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.config.googleApiKey || "");
    const model = genAI.getGenerativeModel({
      model: this.config.llmModel,
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text) {
      throw new Error("Respuesta vacía del modelo Google");
    }
    return text;
  }
}
