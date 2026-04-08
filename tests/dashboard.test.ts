import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDb } from "./helpers.js";
import type { Db } from "../src/db/index.js";
import { accounts, categories, transactions } from "../src/db/schema.js";
import { queryTransactions, queryCategories, queryAccounts } from "../src/tui/queries.js";
import {
  formatCLP,
  renderBar,
  paginate,
  aggregateByCategory,
  getMonthRange,
  getCurrentMonthRange,
} from "../src/tui/format.js";

// ── Format utilities ─────────────────────────────────────────────────────────

describe("formatCLP", () => {
  test("formats negative amounts with minus sign and dot separators", () => {
    expect(formatCLP(-50000)).toBe("-$50.000");
  });

  test("formats positive amounts with dot separators", () => {
    expect(formatCLP(100000)).toBe("$100.000");
  });

  test("formats zero", () => {
    expect(formatCLP(0)).toBe("$0");
  });

  test("formats small amounts without separators", () => {
    expect(formatCLP(999)).toBe("$999");
    expect(formatCLP(-500)).toBe("-$500");
  });

  test("formats large amounts with multiple dot separators", () => {
    expect(formatCLP(1500000)).toBe("$1.500.000");
    expect(formatCLP(-2345678)).toBe("-$2.345.678");
  });
});

describe("renderBar", () => {
  test("renders full bar at 100%", () => {
    expect(renderBar(100, 10)).toBe("[==========] 100%");
  });

  test("renders empty bar at 0%", () => {
    expect(renderBar(0, 10)).toBe("[          ] 0%");
  });

  test("renders proportional bar at 50%", () => {
    expect(renderBar(50, 10)).toBe("[=====     ] 50%");
  });

  test("rounds percentage in label", () => {
    expect(renderBar(33.7, 10)).toBe("[===       ] 34%");
  });

  test("uses default width of 20", () => {
    const bar = renderBar(50);
    expect(bar).toBe("[==========          ] 50%");
  });
});

describe("paginate", () => {
  test("calculates correct page count", () => {
    const result = paginate(100, 15, 1);
    expect(result.totalPages).toBe(7);
  });

  test("returns correct start/end indices for first page", () => {
    const result = paginate(100, 15, 1);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(15);
  });

  test("returns correct start/end indices for last page", () => {
    const result = paginate(100, 15, 7);
    expect(result.startIndex).toBe(90);
    expect(result.endIndex).toBe(100);
  });

  test("clamps page number within valid range", () => {
    expect(paginate(100, 15, 0).currentPage).toBe(1);
    expect(paginate(100, 15, 99).currentPage).toBe(7);
  });

  test("handles empty list", () => {
    const result = paginate(0, 15, 1);
    expect(result.totalPages).toBe(1);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(0);
  });

  test("handles list smaller than page size", () => {
    const result = paginate(5, 15, 1);
    expect(result.totalPages).toBe(1);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(5);
  });
});

describe("getMonthRange", () => {
  test("returns correct range for January", () => {
    expect(getMonthRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  test("returns correct range for February (non-leap year)", () => {
    expect(getMonthRange(2025, 2)).toEqual({ from: "2025-02-01", to: "2025-02-28" });
  });

  test("returns correct range for February (leap year)", () => {
    expect(getMonthRange(2024, 2)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  test("returns correct range for current month", () => {
    const range = getCurrentMonthRange();
    const now = new Date();
    const expectedMonth = String(now.getMonth() + 1).padStart(2, "0");
    expect(range.from).toStartWith(`${now.getFullYear()}-${expectedMonth}-01`);
  });
});

// ── Aggregation ──────────────────────────────────────────────────────────────

describe("aggregateByCategory", () => {
  test("correctly sums expenses by category", () => {
    const rows = [
      { amount: -10000, categoryId: 1, categoryName: "Supermercado", emoji: "" },
      { amount: -20000, categoryId: 1, categoryName: "Supermercado", emoji: "" },
      { amount: -5000, categoryId: 2, categoryName: "Transporte", emoji: "" },
    ];
    const { expenses, totalExpenses } = aggregateByCategory(rows);
    expect(totalExpenses).toBe(-35000);
    expect(expenses).toHaveLength(2);
    expect(expenses[0].categoryName).toBe("Supermercado");
    expect(expenses[0].total).toBe(-30000);
    expect(expenses[1].categoryName).toBe("Transporte");
    expect(expenses[1].total).toBe(-5000);
  });

  test("calculates correct percentages", () => {
    const rows = [
      { amount: -75000, categoryId: 1, categoryName: "Arriendo", emoji: "" },
      { amount: -25000, categoryId: 2, categoryName: "Comida", emoji: "" },
    ];
    const { expenses } = aggregateByCategory(rows);
    expect(Math.round(expenses[0].percentage)).toBe(75);
    expect(Math.round(expenses[1].percentage)).toBe(25);
  });

  test("separates income from expenses", () => {
    const rows = [
      { amount: -30000, categoryId: 1, categoryName: "Gastos", emoji: "" },
      { amount: 500000, categoryId: 3, categoryName: "Sueldo", emoji: "" },
    ];
    const { totalExpenses, totalIncome, expenses } = aggregateByCategory(rows);
    expect(totalExpenses).toBe(-30000);
    expect(totalIncome).toBe(500000);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].categoryName).toBe("Gastos");
  });

  test("handles uncategorized transactions", () => {
    const rows = [{ amount: -10000, categoryId: null, categoryName: null, emoji: null }];
    const { expenses } = aggregateByCategory(rows);
    expect(expenses[0].categoryName).toBe("Sin categoria");
    expect(expenses[0].emoji).toBe("");
  });

  test("handles empty input", () => {
    const { expenses, totalExpenses, totalIncome } = aggregateByCategory([]);
    expect(expenses).toHaveLength(0);
    expect(totalExpenses).toBe(0);
    expect(totalIncome).toBe(0);
  });

  test("excludes internal transfers by category name fallback", () => {
    const rows = [
      { amount: -300000, categoryId: 10, categoryName: "Pago entre cuentas", emoji: "", excludeFromSummary: false },
      { amount: -50000, categoryId: 11, categoryName: "Supermercado", emoji: "", excludeFromSummary: false },
    ];
    const { expenses, totalExpenses } = aggregateByCategory(rows);
    expect(totalExpenses).toBe(-50000);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].categoryName).toBe("Supermercado");
  });
});

// ── Database queries ─────────────────────────────────────────────────────────

describe("queryTransactions", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    db.insert(accounts).values({
      id: 1,
      bankId: "banco-estado",
      name: "Cuenta Corriente",
    }).run();

    db.insert(accounts).values({
      id: 2,
      bankId: "banco-chile",
      name: "Cuenta Vista",
    }).run();

    db.insert(categories).values([
      { id: 1, name: "Supermercado", emoji: "", group: "Comida" },
      { id: 2, name: "Transporte", emoji: "", group: "Transporte" },
    ]).run();

    db.insert(transactions).values([
      {
        id: 1,
        accountId: 1,
        hash: "hash1",
        date: "2026-03-01",
        rawDescription: "LIDER",
        cleanDescription: "lider",
        llmLabel: "Compra Lider",
        amount: -25000,
        source: "account",
        categoryId: 1,
        status: "confirmed",
      },
      {
        id: 2,
        accountId: 1,
        hash: "hash2",
        date: "2026-03-15",
        rawDescription: "UBER",
        cleanDescription: "uber",
        amount: -5000,
        source: "account",
        categoryId: 2,
        status: "pending_review",
      },
      {
        id: 3,
        accountId: 2,
        hash: "hash3",
        date: "2026-02-28",
        rawDescription: "SUELDO",
        cleanDescription: "sueldo",
        amount: 1500000,
        source: "account",
        status: "uncategorized",
      },
      {
        id: 4,
        accountId: 1,
        hash: "hash4",
        date: "2026-03-20",
        rawDescription: "JUMBO",
        cleanDescription: "jumbo",
        amount: -35000,
        source: "account",
        categoryId: 1,
        status: "confirmed",
      },
    ]).run();
  });

  test("returns all transactions without filters", () => {
    const rows = queryTransactions(db, {});
    expect(rows).toHaveLength(4);
  });

  test("filters by date range", () => {
    const rows = queryTransactions(db, { from: "2026-03-01", to: "2026-03-31" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.date >= "2026-03-01" && r.date <= "2026-03-31")).toBe(true);
  });

  test("filters by category", () => {
    const rows = queryTransactions(db, { categoryId: 1 });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.categoryName === "Supermercado")).toBe(true);
  });

  test("filters by account", () => {
    const rows = queryTransactions(db, { accountId: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0].accountName).toBe("Cuenta Vista");
  });

  test("supports multi-select filters", () => {
    const rows = queryTransactions(db, {
      accountIds: [1, 2],
      categoryIds: [1, 2],
      groupNames: ["Comida", "Transporte"],
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => ["Cuenta Corriente", "Cuenta Vista"].includes(row.accountName))).toBe(true);
    expect(rows.every((row) => ["Supermercado", "Transporte"].includes(row.categoryName || ""))).toBe(true);
  });

  test("filters by flow and source", () => {
    const rows = queryTransactions(db, {
      amountTypes: ["expense"],
      sources: ["account"],
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.amount < 0)).toBe(true);
    expect(rows.every((row) => row.source === "account")).toBe(true);
  });

  test("combines multiple filters", () => {
    const rows = queryTransactions(db, {
      from: "2026-03-01",
      to: "2026-03-31",
      categoryId: 1,
      accountId: 1,
    });
    expect(rows).toHaveLength(2);
  });

  test("returns joined category and account data", () => {
    const rows = queryTransactions(db, {});
    const lider = rows.find((r) => r.rawDescription === "LIDER");
    expect(lider).toBeDefined();
    expect(lider!.categoryName).toBe("Supermercado");
    expect(lider!.emoji).toBe("");
    expect(lider!.accountName).toBe("Cuenta Corriente");
    expect(lider!.llmLabel).toBe("Compra Lider");
  });

  test("returns null category fields for uncategorized transactions", () => {
    const rows = queryTransactions(db, {});
    const sueldo = rows.find((r) => r.rawDescription === "SUELDO");
    expect(sueldo).toBeDefined();
    expect(sueldo!.categoryName).toBeNull();
    expect(sueldo!.emoji).toBeNull();
  });

  test("orders by date descending", () => {
    const rows = queryTransactions(db, {});
    expect(rows[0].date).toBe("2026-03-20");
    expect(rows[rows.length - 1].date).toBe("2026-02-28");
  });
});

describe("queryCategories", () => {
  test("returns all categories", () => {
    const db = createTestDb();
    db.insert(categories).values([
      { name: "Supermercado", emoji: "" },
      { name: "Transporte", emoji: "" },
    ]).run();
    const result = queryCategories(db);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
  });
});

describe("queryAccounts", () => {
  test("returns all accounts", () => {
    const db = createTestDb();
    db.insert(accounts).values({
      bankId: "test",
      name: "Test Account",
    }).run();
    const result = queryAccounts(db);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Account");
  });
});
