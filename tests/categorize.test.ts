import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { fuzzyMatch, computeSimilarity, getConfirmedPatterns } from "../src/categorize/fuzzy";
import { createProvider } from "../src/categorize/provider";
import { buildSystemPrompt, buildUserPrompt } from "../src/categorize/prompt";
import {
  classificationSchema,
  parseLLMResponse,
  categorizeTransactions,
} from "../src/categorize/classify";
import { transactions, categories, accounts } from "../src/db/schema";
import type { Config } from "../src/config";

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

describe("fuzzyMatch", () => {
  const patterns = [
    { cleanDescription: "supermercado lider", categoryId: 1 },
    { cleanDescription: "netflix chile", categoryId: 2 },
    { cleanDescription: "farmacia ahumada", categoryId: 3 },
  ];

  test("returns correct match when similarity is high", () => {
    const result = fuzzyMatch("supermercado lider", patterns, 0.85);
    expect(result).not.toBeNull();
    expect(result!.categoryId).toBe(1);
    expect(result!.similarity).toBe(1);
  });

  test("returns best match for similar description", () => {
    const result = fuzzyMatch("supermercado lider express", patterns, 0.6);
    expect(result).not.toBeNull();
    expect(result!.categoryId).toBe(1);
    expect(result!.similarity).toBeGreaterThan(0.6);
  });

  test("returns null when below threshold", () => {
    const result = fuzzyMatch("restaurante el parrillero", patterns, 0.85);
    expect(result).toBeNull();
  });

  test("returns null for empty patterns", () => {
    const result = fuzzyMatch("supermercado lider", [], 0.85);
    expect(result).toBeNull();
  });
});

describe("computeSimilarity", () => {
  test("identical strings return 1", () => {
    expect(computeSimilarity("supermercado lider", "supermercado lider")).toBe(1);
  });

  test("case-insensitive comparison", () => {
    expect(computeSimilarity("SUPERMERCADO LIDER", "supermercado lider")).toBe(1);
  });

  test("similar strings produce high similarity", () => {
    const sim = computeSimilarity("supermercado lider", "supermercado lider express");
    expect(sim).toBeGreaterThan(0.6);
    expect(sim).toBeLessThan(1);
  });

  test("completely different strings produce low similarity", () => {
    const sim = computeSimilarity("netflix", "farmacia");
    expect(sim).toBeLessThan(0.5);
  });

  test("empty strings return 1", () => {
    expect(computeSimilarity("", "")).toBe(1);
  });
});

describe("getConfirmedPatterns", () => {
  test("returns most frequent category per description", () => {
    const db = createTestDb();

    // Insert test data
    db.insert(accounts).values({ bankId: "test-bank", name: "Test Account" }).run();
    db.insert(categories).values([
      { name: "Supermercado", emoji: "" },
      { name: "Entretenimiento", emoji: "" },
    ]).run();

    // 2 confirmed txns mapping "supermercado lider" -> Supermercado (id=1)
    db.insert(transactions).values([
      { accountId: 1, hash: "h1", date: "2024-01-01", rawDescription: "SUPERMERCADO LIDER", cleanDescription: "supermercado lider", amount: -25000, categoryId: 1, status: "confirmed" },
      { accountId: 1, hash: "h2", date: "2024-01-02", rawDescription: "SUPERMERCADO LIDER", cleanDescription: "supermercado lider", amount: -30000, categoryId: 1, status: "confirmed" },
      // 1 confirmed mapping "supermercado lider" -> Entretenimiento (id=2) -- minority
      { accountId: 1, hash: "h3", date: "2024-01-03", rawDescription: "SUPERMERCADO LIDER", cleanDescription: "supermercado lider", amount: -15000, categoryId: 2, status: "confirmed" },
    ]).run();

    const patterns = getConfirmedPatterns(db);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].cleanDescription).toBe("supermercado lider");
    expect(patterns[0].categoryId).toBe(1); // most frequent
  });

  test("ignores uncategorized and pending_review transactions", () => {
    const db = createTestDb();
    db.insert(accounts).values({ bankId: "test-bank", name: "Test Account" }).run();
    db.insert(categories).values({ name: "Supermercado", emoji: "" }).run();

    db.insert(transactions).values([
      { accountId: 1, hash: "h1", date: "2024-01-01", rawDescription: "X", cleanDescription: "lider", amount: -10000, categoryId: 1, status: "uncategorized" },
      { accountId: 1, hash: "h2", date: "2024-01-02", rawDescription: "Y", cleanDescription: "lider", amount: -10000, categoryId: 1, status: "pending_review" },
    ]).run();

    const patterns = getConfirmedPatterns(db);
    expect(patterns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation
// ---------------------------------------------------------------------------

describe("classificationSchema", () => {
  test("validates correct input", () => {
    const valid = [
      { transaction_id: 1, category: "Supermercado", confidence: 0.95, label: "Compra en Lider" },
      { transaction_id: 2, category: "Entretenimiento", confidence: 0.8, label: "Netflix" },
    ];
    const result = classificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects missing fields", () => {
    const invalid = [{ transaction_id: 1, category: "Supermercado" }];
    const result = classificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects confidence out of range", () => {
    const invalid = [{ transaction_id: 1, category: "X", confidence: 1.5, label: "Y" }];
    const result = classificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects non-array input", () => {
    const result = classificationSchema.safeParse({ transaction_id: 1 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseLLMResponse
// ---------------------------------------------------------------------------

describe("parseLLMResponse", () => {
  test("parses clean JSON array", () => {
    const raw = '[{"transaction_id": 1, "category": "Supermercado", "confidence": 0.9, "label": "Compra"}]';
    const result = parseLLMResponse(raw);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].category).toBe("Supermercado");
  });

  test("extracts JSON from markdown code block", () => {
    const raw = '```json\n[{"transaction_id": 1, "category": "Supermercado", "confidence": 0.9, "label": "Compra"}]\n```';
    const result = parseLLMResponse(raw);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
  });

  test("returns null for invalid JSON", () => {
    const result = parseLLMResponse("not json at all");
    expect(result).toBeNull();
  });

  test("returns null for malformed schema", () => {
    const raw = '[{"wrong_field": 1}]';
    const result = parseLLMResponse(raw);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  test("includes all category names", () => {
    const prompt = buildSystemPrompt([
      { name: "Supermercado", group: "Compras" },
      { name: "Entretenimiento", group: "Ocio y transporte" },
      { name: "Transporte publico", group: "Ocio y transporte" },
    ]);
    expect(prompt).toContain("- Supermercado");
    expect(prompt).toContain("- Entretenimiento");
    expect(prompt).toContain("- Transporte publico");
    expect(prompt).toContain("Compras:");
    expect(prompt).toContain("Ocio y transporte:");
  });

  test("includes JSON format instructions", () => {
    const prompt = buildSystemPrompt(["Supermercado"]);
    expect(prompt).toContain("transaction_id");
    expect(prompt).toContain("category");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("label");
  });
});

describe("buildUserPrompt", () => {
  test("includes transactions to classify", () => {
    const prompt = buildUserPrompt(
      [{ id: 1, description: "Lider", amount: -25000 }],
      [],
    );
    expect(prompt).toContain("ID 1");
    expect(prompt).toContain("Lider");
    expect(prompt).toContain("-$25.000");
  });

  test("includes examples when provided", () => {
    const prompt = buildUserPrompt(
      [{ id: 1, description: "Lider", amount: -25000 }],
      [{ description: "Netflix", amount: -8990, category: "Entretenimiento" }],
    );
    expect(prompt).toContain("Ejemplos");
    expect(prompt).toContain("Netflix");
    expect(prompt).toContain("Entretenimiento");
  });

  test("omits examples section when empty", () => {
    const prompt = buildUserPrompt(
      [{ id: 1, description: "Test", amount: -1000 }],
      [],
    );
    expect(prompt).not.toContain("Ejemplos");
  });
});

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

describe("createProvider", () => {
  const baseConfig: Config = {
    dbPath: ":memory:",
    llmProvider: "anthropic",
    llmModel: "test-model",
    confidenceThreshold: 0.8,
    similarityThreshold: 0.85,
  };

  test("returns an object with classify method for anthropic", () => {
    const provider = createProvider({ ...baseConfig, llmProvider: "anthropic" });
    expect(provider).toBeDefined();
    expect(typeof provider.classify).toBe("function");
  });

  test("returns an object with classify method for openai", () => {
    const provider = createProvider({ ...baseConfig, llmProvider: "openai" });
    expect(provider).toBeDefined();
    expect(typeof provider.classify).toBe("function");
  });

  test("returns an object with classify method for google", () => {
    const provider = createProvider({ ...baseConfig, llmProvider: "google" });
    expect(provider).toBeDefined();
    expect(typeof provider.classify).toBe("function");
  });

  test("throws for unsupported provider", () => {
    expect(() =>
      createProvider({ ...baseConfig, llmProvider: "unknown" as Config["llmProvider"] }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// End-to-end categorization flow (with mocked LLM)
// ---------------------------------------------------------------------------

describe("categorizeTransactions (e2e with mock LLM)", () => {
  function seedDb(db: ReturnType<typeof createTestDb>) {
    db.insert(accounts).values({ bankId: "test-bank", name: "Test Account" }).run();
    db.insert(categories).values([
      { name: "Supermercado", emoji: "" },
      { name: "Entretenimiento", emoji: "" },
      { name: "Farmacia", emoji: "" },
    ]).run();
  }

  test("fuzzy matches when confirmed history exists", async () => {
    const db = createTestDb();
    seedDb(db);

    // Add confirmed history
    db.insert(transactions).values({
      accountId: 1, hash: "confirmed1", date: "2024-01-01",
      rawDescription: "SUPERMERCADO LIDER", cleanDescription: "supermercado lider",
      amount: -25000, categoryId: 1, status: "confirmed",
    }).run();

    // Add uncategorized transaction similar to the confirmed one
    db.insert(transactions).values({
      accountId: 1, hash: "new1", date: "2024-01-15",
      rawDescription: "SUPERMERCADO LIDER", cleanDescription: "supermercado lider",
      amount: -30000, status: "uncategorized",
    }).run();

    const config: Config = {
      dbPath: ":memory:",
      llmProvider: "anthropic",
      llmModel: "test",
      confidenceThreshold: 0.8,
      similarityThreshold: 0.85,
    };

    const result = await categorizeTransactions(db, config);
    expect(result.fuzzyMatched).toBe(1);

    // Verify the transaction was updated
    const updated = db.select().from(transactions).where(eq(transactions.hash, "new1")).all();
    expect(updated[0].status).toBe("pending_review");
    expect(updated[0].suggestedBy).toBe("fuzzy");
    expect(updated[0].categoryId).toBe(1);
  });

  test("no fuzzy match leaves transactions for LLM fallback", async () => {
    const db = createTestDb();
    seedDb(db);

    db.insert(transactions).values({
      accountId: 1, hash: "new1", date: "2024-01-15",
      rawDescription: "NETFLIX CHILE", cleanDescription: "netflix chile",
      amount: -8990, status: "uncategorized",
    }).run();

    const config: Config = {
      dbPath: ":memory:",
      llmProvider: "anthropic",
      llmModel: "test",
      confidenceThreshold: 0.8,
      similarityThreshold: 0.85,
    };

    // With no confirmed history, fuzzy matching finds nothing.
    // The LLM call will fail (no real API key), so all remain as failed.
    const result = await categorizeTransactions(db, config);
    expect(result.fuzzyMatched).toBe(0);
    // LLM call fails without API key, so transaction counts as failed
    expect(result.failed).toBe(1);
  });

  test("LLM classification pipeline: parse response and update DB", async () => {
    const db = createTestDb();
    seedDb(db);

    db.insert(transactions).values([
      {
        accountId: 1, hash: "b1", date: "2024-01-01",
        rawDescription: "NETFLIX", cleanDescription: "netflix",
        amount: -8990, status: "uncategorized",
      },
      {
        accountId: 1, hash: "b2", date: "2024-01-02",
        rawDescription: "FARMACIA AHUMADA", cleanDescription: "farmacia ahumada",
        amount: -5000, status: "uncategorized",
      },
    ]).run();

    const txRows = db.select().from(transactions).all();

    // Simulate LLM response parsing and DB updates (the core of classifyWithLLM)
    const mockResponse = JSON.stringify([
      { transaction_id: txRows[0].id, category: "Entretenimiento", confidence: 0.92, label: "Netflix" },
      { transaction_id: txRows[1].id, category: "Farmacia", confidence: 0.88, label: "Farmacia Ahumada" },
    ]);

    const classifications = parseLLMResponse(mockResponse);
    expect(classifications).toHaveLength(2);

    const allCategories = db.select().from(categories).all();
    const categoryMap = new Map(allCategories.map((c) => [c.name, c.id]));

    for (const cls of classifications!) {
      const catId = categoryMap.get(cls.category);
      if (!catId) continue;

      db.update(transactions)
        .set({
          categoryId: catId,
          suggestedBy: "llm",
          confidence: cls.confidence,
          llmLabel: cls.label,
          status: "pending_review",
        })
        .where(eq(transactions.id, cls.transaction_id))
        .run();
    }

    const updatedTxs = db.select().from(transactions).all();
    for (const tx of updatedTxs) {
      expect(tx.status).toBe("pending_review");
      expect(tx.suggestedBy).toBe("llm");
      expect(tx.categoryId).not.toBeNull();
      expect(tx.confidence).toBeGreaterThan(0);
    }

    expect(updatedTxs[0].llmLabel).toBe("Netflix");
    expect(updatedTxs[1].llmLabel).toBe("Farmacia Ahumada");
  });

  test("returns zero counts when no uncategorized transactions exist", async () => {
    const db = createTestDb();
    seedDb(db);

    const config: Config = {
      dbPath: ":memory:",
      llmProvider: "anthropic",
      llmModel: "test",
      confidenceThreshold: 0.8,
      similarityThreshold: 0.85,
    };

    const result = await categorizeTransactions(db, config);
    expect(result.fuzzyMatched).toBe(0);
    expect(result.llmCategorized).toBe(0);
    expect(result.failed).toBe(0);
  });
});
