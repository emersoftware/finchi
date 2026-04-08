import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { accounts, categories, transactions, categorizationHistory } from "../src/db/schema";
import { seed, CATEGORY_COUNT } from "../src/db/seed";

function setupSeededDb() {
  const db = createTestDb();
  seed(db);
  return db;
}

function insertAccount(db: ReturnType<typeof createTestDb>, bankId = "falabella", name = "Cuenta Vista") {
  return db.insert(accounts).values({ bankId, name }).returning().get();
}

function insertTransaction(
  db: ReturnType<typeof createTestDb>,
  accountId: number,
  overrides: Partial<typeof transactions.$inferInsert> = {}
) {
  return db
    .insert(transactions)
    .values({
      accountId,
      hash: overrides.hash ?? `hash-${Date.now()}-${Math.random()}`,
      date: "2025-01-15",
      rawDescription: "COMPRA EN LIDER",
      cleanDescription: "Compra en Lider",
      amount: -25000,
      ...overrides,
    })
    .returning()
    .get();
}

describe("Schema tables accept inserts", () => {
  test("insert into accounts", () => {
    const db = createTestDb();
    const account = insertAccount(db);
    expect(account.id).toBe(1);
    expect(account.bankId).toBe("falabella");
    expect(account.name).toBe("Cuenta Vista");
  });

  test("insert into categories", () => {
    const db = createTestDb();
    const cat = db.insert(categories).values({ name: "Test", emoji: "T" }).returning().get();
    expect(cat.id).toBe(1);
    expect(cat.name).toBe("Test");
  });

  test("insert into transactions", () => {
    const db = createTestDb();
    const account = insertAccount(db);
    const txn = insertTransaction(db, account.id);
    expect(txn.id).toBe(1);
    expect(txn.amount).toBe(-25000);
    expect(txn.status).toBe("uncategorized");
  });

  test("insert into categorization_history", () => {
    const db = setupSeededDb();
    const account = insertAccount(db);
    const txn = insertTransaction(db, account.id);
    const cats = db.select().from(categories).all();
    const entry = db
      .insert(categorizationHistory)
      .values({
        transactionId: txn.id,
        oldCategoryId: null,
        newCategoryId: cats[0].id,
        changedBy: "user",
      })
      .returning()
      .get();
    expect(entry.id).toBe(1);
    expect(entry.changedBy).toBe("user");
  });
});

describe("Seed function", () => {
  test("inserts all default categories", () => {
    const db = setupSeededDb();
    const all = db.select().from(categories).all();
    expect(all).toHaveLength(CATEGORY_COUNT);
  });

  test("seed is idempotent (running twice does not duplicate)", () => {
    const db = createTestDb();
    seed(db);
    seed(db);
    const all = db.select().from(categories).all();
    expect(all).toHaveLength(CATEGORY_COUNT);
  });

  test("all expected category names are present", () => {
    const db = setupSeededDb();
    const names = db.select().from(categories).all().map((c) => c.name);
    const expected = [
      "Supermercado",
      "Restaurantes",
      "Transporte publico",
      "Farmacia",
      "Internet",
      "Arriendo",
      "Educacion",
      "Transferencia a terceros",
      "Pago entre cuentas",
      "Sueldo",
      "Entretenimiento",
      "Otros",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});

describe("Foreign key constraints", () => {
  test("transaction must reference valid account", () => {
    const db = createTestDb();
    expect(() =>
      db
        .insert(transactions)
        .values({
          accountId: 999,
          hash: "bad-ref",
          date: "2025-01-15",
          rawDescription: "test",
          cleanDescription: "test",
          amount: -1000,
        })
        .run()
    ).toThrow();
  });

  test("categorization_history must reference valid transaction", () => {
    const db = setupSeededDb();
    const cats = db.select().from(categories).all();
    expect(() =>
      db
        .insert(categorizationHistory)
        .values({
          transactionId: 999,
          newCategoryId: cats[0].id,
          changedBy: "user",
        })
        .run()
    ).toThrow();
  });
});

describe("Uniqueness constraints", () => {
  test("duplicate transaction hash is rejected", () => {
    const db = createTestDb();
    const account = insertAccount(db);
    insertTransaction(db, account.id, { hash: "dup-hash" });
    expect(() => insertTransaction(db, account.id, { hash: "dup-hash" })).toThrow();
  });

  test("duplicate category name is rejected", () => {
    const db = createTestDb();
    db.insert(categories).values({ name: "Unica", emoji: "U" }).run();
    expect(() => db.insert(categories).values({ name: "Unica", emoji: "U" }).run()).toThrow();
  });
});

describe("Query transactions", () => {
  test("query by status", () => {
    const db = setupSeededDb();
    const account = insertAccount(db);
    insertTransaction(db, account.id, { hash: "h1", status: "uncategorized" });
    insertTransaction(db, account.id, { hash: "h2", status: "pending_review" });
    insertTransaction(db, account.id, { hash: "h3", status: "confirmed" });

    const uncategorized = db
      .select()
      .from(transactions)
      .where(eq(transactions.status, "uncategorized"))
      .all();
    expect(uncategorized).toHaveLength(1);
    expect(uncategorized[0].hash).toBe("h1");

    const pending = db
      .select()
      .from(transactions)
      .where(eq(transactions.status, "pending_review"))
      .all();
    expect(pending).toHaveLength(1);
  });

  test("query by account", () => {
    const db = createTestDb();
    const a1 = insertAccount(db, "falabella", "Cuenta 1");
    const a2 = insertAccount(db, "bci", "Cuenta 2");
    insertTransaction(db, a1.id, { hash: "t1" });
    insertTransaction(db, a1.id, { hash: "t2" });
    insertTransaction(db, a2.id, { hash: "t3" });

    const fromA1 = db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, a1.id))
      .all();
    expect(fromA1).toHaveLength(2);

    const fromA2 = db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, a2.id))
      .all();
    expect(fromA2).toHaveLength(1);
  });

  test("query by category", () => {
    const db = setupSeededDb();
    const account = insertAccount(db);
    const cats = db.select().from(categories).all();
    const superCat = cats.find((c) => c.name === "Supermercado")!;
    const transCat = cats.find((c) => c.name === "Transporte publico")!;

    insertTransaction(db, account.id, { hash: "c1", categoryId: superCat.id });
    insertTransaction(db, account.id, { hash: "c2", categoryId: superCat.id });
    insertTransaction(db, account.id, { hash: "c3", categoryId: transCat.id });
    insertTransaction(db, account.id, { hash: "c4" }); // no category

    const superTxns = db
      .select()
      .from(transactions)
      .where(eq(transactions.categoryId, superCat.id))
      .all();
    expect(superTxns).toHaveLength(2);

    const transTxns = db
      .select()
      .from(transactions)
      .where(eq(transactions.categoryId, transCat.id))
      .all();
    expect(transTxns).toHaveLength(1);
  });
});
