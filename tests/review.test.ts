import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDb } from "./helpers";
import type { Db } from "../src/db/index";
import { accounts, categories, transactions, categorizationHistory } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  loadPendingTransactions,
  loadCategories,
  confirmTransaction,
  confirmAll,
  editCategory,
  formatAmount,
  formatConfidence,
  displayDescription,
} from "../src/tui/review-logic";
import { paginateRows } from "../src/tui/components/table";

let db: Db;

/** Insert seed data: one account, some categories, and transactions. */
async function seedTestData(db: Db) {
  await db.insert(accounts).values({
    bankId: "banco-estado",
    name: "Cuenta principal",
  });

  await db.insert(categories).values([
    { name: "Supermercado", emoji: "" },
    { name: "Transporte", emoji: "" },
    { name: "Restaurantes", emoji: "" },
  ]);

  await db.insert(transactions).values([
    {
      accountId: 1,
      hash: "hash1",
      date: "2026-03-15",
      rawDescription: "COMPRA LIDER 1234",
      cleanDescription: "compra lider 1234",
      llmLabel: "Compra en Lider Express",
      amount: -45000,
      categoryId: 1,
      confidence: 0.85,
      suggestedBy: "llm",
      status: "pending_review",
      source: "account",
    },
    {
      accountId: 1,
      hash: "hash2",
      date: "2026-03-14",
      rawDescription: "PAGO BIP METRO",
      cleanDescription: "pago bip metro",
      llmLabel: null,
      amount: -1500,
      categoryId: 2,
      confidence: 0.92,
      suggestedBy: "fuzzy",
      status: "pending_review",
      source: "account",
    },
    {
      accountId: 1,
      hash: "hash3",
      date: "2026-03-13",
      rawDescription: "TRANSFERENCIA RECIBIDA",
      cleanDescription: "transferencia recibida",
      llmLabel: "Sueldo mensual",
      amount: 1200000,
      categoryId: null,
      confidence: null,
      suggestedBy: null,
      status: "pending_review",
      source: "account",
    },
    {
      accountId: 1,
      hash: "hash4",
      date: "2026-03-12",
      rawDescription: "COMPRA LIDER 5678",
      cleanDescription: "compra lider 5678",
      amount: -32000,
      categoryId: 1,
      confidence: 0.9,
      suggestedBy: "llm",
      status: "confirmed",
      source: "account",
    },
  ]);
}

beforeEach(() => {
  db = createTestDb();
});

describe("loadPendingTransactions", () => {
  test("returns only pending_review transactions", async () => {
    await seedTestData(db);
    const pending = await loadPendingTransactions(db);
    expect(pending.length).toBe(3);
    // The confirmed one (hash4) should not appear
    expect(pending.every((t) => t.id !== 4)).toBe(true);
  });

  test("joins category and account info", async () => {
    await seedTestData(db);
    const pending = await loadPendingTransactions(db);
    const lider = pending.find((t) => t.id === 1)!;
    expect(lider.categoryName).toBe("Supermercado");
    expect(lider.categoryEmoji).toBe("");
    expect(lider.bankId).toBe("banco-estado");
    expect(lider.accountAlias).toBe("Cuenta principal");
  });

  test("returns empty array when no pending transactions", async () => {
    // no seed data
    const pending = await loadPendingTransactions(db);
    expect(pending.length).toBe(0);
  });
});

describe("loadCategories", () => {
  test("loads all categories", async () => {
    await seedTestData(db);
    const cats = await loadCategories(db);
    expect(cats.length).toBe(3);
    expect(cats.map((c) => c.name).sort()).toEqual(["Restaurantes", "Supermercado", "Transporte"]);
  });
});

describe("confirmTransaction", () => {
  test("sets status to confirmed and creates history entry", async () => {
    await seedTestData(db);
    const pending = await loadPendingTransactions(db);
    const txn = pending.find((t) => t.id === 1)!;

    await confirmTransaction(db, txn);

    // Verify status change
    const updated = await db
      .select({ status: transactions.status })
      .from(transactions)
      .where(eq(transactions.id, 1));
    expect(updated[0].status).toBe("confirmed");

    // Verify history entry
    const history = await db
      .select()
      .from(categorizationHistory)
      .where(eq(categorizationHistory.transactionId, 1));
    expect(history.length).toBe(1);
    expect(history[0].newCategoryId).toBe(1);
    expect(history[0].changedBy).toBe("review_confirm");
  });

  test("does not create history when no category", async () => {
    await seedTestData(db);
    const pending = await loadPendingTransactions(db);
    const txn = pending.find((t) => t.id === 3)!; // no category
    expect(txn.categoryId).toBeNull();

    await confirmTransaction(db, txn);

    const history = await db
      .select()
      .from(categorizationHistory)
      .where(eq(categorizationHistory.transactionId, 3));
    expect(history.length).toBe(0);
  });
});

describe("confirmAll", () => {
  test("batch confirms all given transactions", async () => {
    await seedTestData(db);
    const pending = await loadPendingTransactions(db);

    const count = await confirmAll(db, pending);
    expect(count).toBe(3);

    // All should now be confirmed
    const remaining = await loadPendingTransactions(db);
    expect(remaining.length).toBe(0);
  });
});

describe("editCategory", () => {
  test("updates categoryId, suggestedBy, and confidence", async () => {
    await seedTestData(db);

    // Change txn 1 from Supermercado (id=1) to Restaurantes (id=3)
    await editCategory(db, 1, 3);

    const updated = await db
      .select({
        categoryId: transactions.categoryId,
        suggestedBy: transactions.suggestedBy,
        confidence: transactions.confidence,
        status: transactions.status,
      })
      .from(transactions)
      .where(eq(transactions.id, 1));

    expect(updated[0].categoryId).toBe(3);
    expect(updated[0].suggestedBy).toBe("human");
    expect(updated[0].confidence).toBeNull();
    // Status stays pending_review (not auto-confirmed)
    expect(updated[0].status).toBe("pending_review");
  });

  test("creates categorization_history with changedBy=human", async () => {
    await seedTestData(db);
    await editCategory(db, 1, 3);

    const history = await db
      .select()
      .from(categorizationHistory)
      .where(eq(categorizationHistory.transactionId, 1));
    expect(history.length).toBe(1);
    expect(history[0].newCategoryId).toBe(3);
    expect(history[0].changedBy).toBe("human");
  });
});

describe("formatAmount", () => {
  test("formats negative amounts with -$ prefix and dot separators", () => {
    expect(formatAmount(-45000)).toBe("-$45.000");
    expect(formatAmount(-1500)).toBe("-$1.500");
    expect(formatAmount(-100)).toBe("-$100");
    expect(formatAmount(-1234567)).toBe("-$1.234.567");
  });

  test("formats positive amounts with $ prefix", () => {
    expect(formatAmount(1200000)).toBe("$1.200.000");
    expect(formatAmount(500)).toBe("$500");
    expect(formatAmount(0)).toBe("$0");
  });
});

describe("formatConfidence", () => {
  test("formats as percentage", () => {
    expect(formatConfidence(0.85)).toBe("85%");
    expect(formatConfidence(0.923)).toBe("92%");
    expect(formatConfidence(1.0)).toBe("100%");
  });

  test("returns dash for null", () => {
    expect(formatConfidence(null)).toBe("-");
  });
});

describe("displayDescription", () => {
  test("prefers llmLabel over rawDescription", () => {
    const txn = {
      id: 1,
      date: "",
      rawDescription: "RAW",
      llmLabel: "Pretty Label",
      amount: 0,
      categoryId: null,
      categoryName: null,
      categoryEmoji: null,
      confidence: null,
      suggestedBy: null,
      accountAlias: null,
      bankId: "",
    };
    expect(displayDescription(txn)).toBe("Pretty Label");
  });

  test("falls back to rawDescription when llmLabel is null", () => {
    const txn = {
      id: 1,
      date: "",
      rawDescription: "RAW DESC",
      llmLabel: null,
      amount: 0,
      categoryId: null,
      categoryName: null,
      categoryEmoji: null,
      confidence: null,
      suggestedBy: null,
      accountAlias: null,
      bankId: "",
    };
    expect(displayDescription(txn)).toBe("RAW DESC");
  });
});

describe("paginateRows", () => {
  test("returns correct page for first page", () => {
    const result = paginateRows(30, 5, 15);
    expect(result.start).toBe(0);
    expect(result.end).toBe(15);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  test("returns correct page for second page", () => {
    const result = paginateRows(30, 20, 15);
    expect(result.start).toBe(15);
    expect(result.end).toBe(30);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  test("handles last partial page", () => {
    const result = paginateRows(22, 17, 15);
    expect(result.start).toBe(15);
    expect(result.end).toBe(22);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  test("returns zeros for empty data", () => {
    const result = paginateRows(0, 0, 15);
    expect(result.start).toBe(0);
    expect(result.end).toBe(0);
    expect(result.page).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  test("single page when data fits", () => {
    const result = paginateRows(10, 3, 15);
    expect(result.start).toBe(0);
    expect(result.end).toBe(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });
});
