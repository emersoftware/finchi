import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { cleanDescription, convertDate } from "../src/sync/normalize";
import { generateHash } from "../src/sync/dedup";
import { accounts, transactions } from "../src/db/schema";

// ── cleanDescription ─────────────────────────────────────────────────

describe("cleanDescription", () => {
  test("trims leading and trailing whitespace", () => {
    expect(cleanDescription("  hello  ")).toBe("hello");
  });

  test("collapses multiple spaces to a single space", () => {
    expect(cleanDescription("pago  en   tienda")).toBe("pago en tienda");
  });

  test("lowercases the description", () => {
    expect(cleanDescription("PAGO EN TIENDA")).toBe("pago en tienda");
  });

  test("handles all normalizations together", () => {
    expect(cleanDescription("  COMPRA   EN  SUPERMERCADO   ")).toBe("compra en supermercado");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(cleanDescription("   ")).toBe("");
  });
});

// ── convertDate ──────────────────────────────────────────────────────

describe("convertDate", () => {
  test("converts dd-mm-yyyy to YYYY-MM-DD", () => {
    expect(convertDate("13-03-2026")).toBe("2026-03-13");
  });

  test("preserves leading zeros", () => {
    expect(convertDate("01-01-2026")).toBe("2026-01-01");
  });

  test("handles end-of-year dates", () => {
    expect(convertDate("31-12-2025")).toBe("2025-12-31");
  });
});

// ── generateHash ─────────────────────────────────────────────────────

describe("generateHash", () => {
  test("returns a hex string", () => {
    const hash = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic: same inputs produce same hash", () => {
    const a = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    const b = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    expect(a).toBe(b);
  });

  test("different accounts produce different hashes", () => {
    const a = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    const b = generateHash(2, "2026-03-13", "pago en tienda", -5000);
    expect(a).not.toBe(b);
  });

  test("different dates produce different hashes", () => {
    const a = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    const b = generateHash(1, "2026-03-14", "pago en tienda", -5000);
    expect(a).not.toBe(b);
  });

  test("different descriptions produce different hashes", () => {
    const a = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    const b = generateHash(1, "2026-03-13", "pago en farmacia", -5000);
    expect(a).not.toBe(b);
  });

  test("different amounts produce different hashes", () => {
    const a = generateHash(1, "2026-03-13", "pago en tienda", -5000);
    const b = generateHash(1, "2026-03-13", "pago en tienda", -3000);
    expect(a).not.toBe(b);
  });
});

// ── Sync integration ─────────────────────────────────────────────────

describe("sync integration", () => {
  function insertTestAccount(db: ReturnType<typeof createTestDb>) {
    return db.insert(accounts).values({ bankId: "banco-test", name: "Cuenta Test" }).run();
  }

  function buildTransaction(overrides: Partial<typeof transactions.$inferInsert> = {}) {
    const date = "2026-03-13";
    const raw = "COMPRA EN SUPERMERCADO";
    return {
      accountId: 1,
      hash: generateHash(1, date, raw, -15000),
      date,
      rawDescription: raw,
      cleanDescription: cleanDescription(raw),
      amount: -15000,
      balance: 500000,
      source: "account",
      status: "uncategorized" as const,
      ...overrides,
    };
  }

  test("inserts a new transaction into the database", async () => {
    const db = createTestDb();
    insertTestAccount(db);

    const txn = buildTransaction();
    await db.insert(transactions).values(txn);

    const rows = await db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].rawDescription).toBe("COMPRA EN SUPERMERCADO");
    expect(rows[0].cleanDescription).toBe("compra en supermercado");
    expect(rows[0].amount).toBe(-15000);
    expect(rows[0].status).toBe("uncategorized");
  });

  test("skips duplicate transactions (same hash)", async () => {
    const db = createTestDb();
    insertTestAccount(db);

    const txn = buildTransaction();
    await db.insert(transactions).values(txn);

    // Attempt to insert a duplicate -- check first as the sync module does
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.hash, txn.hash))
      .get();

    expect(existing).toBeDefined();

    // Only insert if not existing (mirroring sync logic)
    if (!existing) {
      await db.insert(transactions).values(txn);
    }

    const rows = await db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
  });

  test("inserts multiple distinct transactions", async () => {
    const db = createTestDb();
    insertTestAccount(db);

    const txn1 = buildTransaction();
    const txn2 = buildTransaction({
      hash: generateHash(1, "2026-03-14", "PAGO EN FARMACIA", -8000),
      date: "2026-03-14",
      rawDescription: "PAGO EN FARMACIA",
      cleanDescription: cleanDescription("PAGO EN FARMACIA"),
      amount: -8000,
    });

    await db.insert(transactions).values(txn1);
    await db.insert(transactions).values(txn2);

    const rows = await db.select().from(transactions).all();
    expect(rows).toHaveLength(2);
  });

  test("new transactions default to uncategorized status", async () => {
    const db = createTestDb();
    insertTestAccount(db);

    await db.insert(transactions).values(buildTransaction());
    const row = await db.select().from(transactions).get();

    expect(row?.status).toBe("uncategorized");
    expect(row?.categoryId).toBeNull();
    expect(row?.suggestedBy).toBeNull();
  });
});
