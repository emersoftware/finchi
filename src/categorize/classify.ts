import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { transactions, categories } from "../db/schema";
import type { Db } from "../db";
import type { Config } from "../config";
import { fuzzyMatch, getConfirmedPatterns } from "./fuzzy";
import { createProvider, type LLMProvider } from "./provider";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

export const classificationSchema = z.array(
  z.object({
    transaction_id: z.number(),
    category: z.string(),
    confidence: z.number().min(0).max(1),
    label: z.string(),
  }),
);

export type Classification = z.infer<typeof classificationSchema>[number];

export interface CategorizeResult {
  fuzzyMatched: number;
  llmCategorized: number;
  failed: number;
  error?: string;
}

/** Main orchestrator: fuzzy match first, LLM for the remainder. */
export async function categorizeTransactions(
  db: Db,
  config: Config,
): Promise<CategorizeResult> {
  const uncategorized = db
    .select()
    .from(transactions)
    .where(eq(transactions.status, "uncategorized"))
    .all();

  if (uncategorized.length === 0) {
    return { fuzzyMatched: 0, llmCategorized: 0, failed: 0 };
  }

  const confirmedPatterns = getConfirmedPatterns(db);

  let fuzzyMatched = 0;
  const remainingForLLM: Array<{ id: number; description: string; amount: number }> = [];

  for (const tx of uncategorized) {
    const match = fuzzyMatch(tx.cleanDescription, confirmedPatterns, config.similarityThreshold);

    if (match) {
      db.update(transactions)
        .set({
          categoryId: match.categoryId,
          suggestedBy: "fuzzy",
          confidence: match.similarity,
          status: "pending_review",
        })
        .where(eq(transactions.id, tx.id))
        .run();
      fuzzyMatched++;
    } else {
      remainingForLLM.push({
        id: tx.id,
        description: tx.cleanDescription,
        amount: tx.amount,
      });
    }
  }

  if (remainingForLLM.length === 0) {
    return { fuzzyMatched, llmCategorized: 0, failed: 0 };
  }

  const llmResult = await classifyWithLLM(remainingForLLM, db, config);

  return { fuzzyMatched, llmCategorized: llmResult.llmCategorized, failed: llmResult.failed, error: llmResult.error };
}

/** Categorize a specific batch via LLM only (for onboarding when there is no history). */
export async function categorizeBatch(
  batch: Array<{ id: number; description: string; amount: number }>,
  db: Db,
  config: Config,
): Promise<{ llmCategorized: number; failed: number }> {
  return classifyWithLLM(batch, db, config);
}

const BATCH_SIZE = 30;

/** Shared LLM classification logic. Processes in batches to avoid token limits. */
async function classifyWithLLM(
  txBatch: Array<{ id: number; description: string; amount: number }>,
  db: Db,
  config: Config,
): Promise<{ llmCategorized: number; failed: number; error?: string }> {
  const allCategories = db.select().from(categories).all();
  if (allCategories.length === 0) {
    return { llmCategorized: 0, failed: txBatch.length, error: "No hay categorias en la base de datos" };
  }

  const categoryMap = new Map(allCategories.map((c) => [c.name, c.id]));

  const examples = db
    .select({
      description: transactions.cleanDescription,
      amount: transactions.amount,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.status, "confirmed"))
    .orderBy(desc(transactions.createdAt))
    .limit(30)
    .all();

  const exampleInputs = examples.map((e) => ({
    description: e.description,
    amount: e.amount,
    category: e.categoryName,
  }));

  const systemPrompt = buildSystemPrompt(
    allCategories.map((c) => ({ name: c.name, group: c.group })),
  );
  const provider: LLMProvider = createProvider(config);

  let totalCategorized = 0;
  let totalFailed = 0;
  let lastError: string | undefined;

  // Process in batches
  for (let i = 0; i < txBatch.length; i += BATCH_SIZE) {
    const chunk = txBatch.slice(i, i + BATCH_SIZE);
    const userPrompt = buildUserPrompt(chunk, exampleInputs);

    let rawResponse: string;
    try {
      rawResponse = await provider.classify(systemPrompt, userPrompt);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      lastError = `LLM error: ${msg}`;
      totalFailed += chunk.length;
      continue;
    }

    const classifications = parseLLMResponse(rawResponse);
    if (!classifications) {
      lastError = "No se pudo interpretar la respuesta del LLM";
      totalFailed += chunk.length;
      continue;
    }

    const chunkIds = new Set(chunk.map((tx) => tx.id));
    let chunkSuccess = 0;

    for (const classification of classifications) {
      if (!chunkIds.has(classification.transaction_id)) continue;

      const categoryId = categoryMap.get(classification.category);
      if (!categoryId) continue;

      db.update(transactions)
        .set({
          categoryId,
          suggestedBy: "llm",
          confidence: classification.confidence,
          llmLabel: classification.label,
          status: "pending_review",
        })
        .where(eq(transactions.id, classification.transaction_id))
        .run();
      chunkSuccess++;
    }

    totalCategorized += chunkSuccess;
    totalFailed += chunk.length - chunkSuccess;
  }

  return { llmCategorized: totalCategorized, failed: totalFailed, error: lastError };
}

/** Extract JSON array from LLM response and validate with Zod. */
export function parseLLMResponse(raw: string): Classification[] | null {
  // Try to extract JSON from the response (LLMs sometimes wrap it in markdown)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = classificationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
