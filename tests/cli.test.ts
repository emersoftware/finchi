import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli";
import { queryTransactions, printTable } from "../src/commands/txns";
import { formatCLP } from "../src/tui/format";
import { createTestDb } from "./helpers";
import { accounts, categories, transactions } from "../src/db/schema";

// ---------- parseArgs ----------

describe("parseArgs", () => {
  test("extracts command with no flags", () => {
    const { command, flags } = parseArgs(["bun", "cli.ts", "txns"]);
    expect(command).toBe("txns");
    expect(flags).toEqual({});
  });

  test("extracts command with boolean flag", () => {
    const { command, flags } = parseArgs(["bun", "cli.ts", "txns", "--uncategorized"]);
    expect(command).toBe("txns");
    expect(flags["uncategorized"]).toBe(true);
  });

  test("extracts command with value flag", () => {
    const { command, flags } = parseArgs([
      "bun", "cli.ts", "txns", "--category", "comida", "--from", "2025-01-01",
    ]);
    expect(command).toBe("txns");
    expect(flags["category"]).toBe("comida");
    expect(flags["from"]).toBe("2025-01-01");
  });

  test("extracts short flags", () => {
    const { command, flags } = parseArgs(["bun", "cli.ts", "-h"]);
    expect(command).toBe("");
    expect(flags["h"]).toBe(true);
  });

  test("handles no command and --help", () => {
    const { command, flags } = parseArgs(["bun", "cli.ts", "--help"]);
    expect(command).toBe("");
    expect(flags["help"]).toBe(true);
  });

  test("handles sync with --3m flag", () => {
    const { command, flags } = parseArgs(["bun", "cli.ts", "sync", "--3m"]);
    expect(command).toBe("sync");
    expect(flags["3m"]).toBe(true);
  });

  test("handles mixed boolean and value flags", () => {
    const { command, flags } = parseArgs([
      "bun", "cli.ts", "txns", "--uncategorized", "--from", "2025-01-01", "--to", "2025-12-31",
    ]);
    expect(command).toBe("txns");
    expect(flags["uncategorized"]).toBe(true);
    expect(flags["from"]).toBe("2025-01-01");
    expect(flags["to"]).toBe("2025-12-31");
  });
});

// ---------- formatCLP ----------

describe("formatCLP", () => {
  test("formats negative amount as expense", () => {
    expect(formatCLP(-50000)).toBe("-$50.000");
  });

  test("formats positive amount as income", () => {
    expect(formatCLP(100000)).toBe("$100.000");
  });

  test("formats zero", () => {
    expect(formatCLP(0)).toBe("$0");
  });

  test("formats small amount", () => {
    expect(formatCLP(-500)).toBe("-$500");
  });

  test("formats large amount", () => {
    expect(formatCLP(1500000)).toBe("$1.500.000");
  });

  test("formats negative large amount", () => {
    expect(formatCLP(-1234567)).toBe("-$1.234.567");
  });
});

// ---------- queryTransactions + printTable ----------

describe("txns command", () => {
  async function seedTestDb() {
    const db = createTestDb();

    // Insert account
    await db.insert(accounts).values({ bankId: "banco-test", name: "Cuenta Test" });

    // Insert categories
    await db.insert(categories).values([
      { name: "Comida", emoji: "" },
      { name: "Transporte", emoji: "" },
    ]);

    // Insert transactions
    await db.insert(transactions).values([
      {
        accountId: 1,
        hash: "hash1",
        date: "2025-01-15",
        rawDescription: "UBER EATS",
        cleanDescription: "uber eats",
        amount: -15000,
        status: "confirmed",
        categoryId: 1,
        llmLabel: "Uber Eats Delivery",
      },
      {
        accountId: 1,
        hash: "hash2",
        date: "2025-01-20",
        rawDescription: "TRANSFERENCIA RECIBIDA",
        cleanDescription: "transferencia recibida",
        amount: 500000,
        status: "uncategorized",
      },
      {
        accountId: 1,
        hash: "hash3",
        date: "2025-02-01",
        rawDescription: "BIP RECARGA",
        cleanDescription: "bip recarga",
        amount: -5000,
        status: "confirmed",
        categoryId: 2,
      },
      {
        accountId: 1,
        hash: "hash4",
        date: "2025-02-10",
        rawDescription: "RAPPI",
        cleanDescription: "rappi",
        amount: -12000,
        status: "pending_review",
        categoryId: 1,
        suggestedBy: "llm",
        confidence: 0.9,
      },
    ]);

    return db;
  }

  test("returns all transactions with no filters", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({}, db);
    expect(rows.length).toBe(4);
  });

  test("filters by --uncategorized", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({ uncategorized: true }, db);
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe("TRANSFERENCIA RECIBIDA");
  });

  test("filters by --category (case-insensitive)", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({ category: "comida" }, db);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.categoryName === "Comida")).toBe(true);
  });

  test("filters by --from date", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({ from: "2025-02-01" }, db);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.date >= "2025-02-01")).toBe(true);
  });

  test("filters by --to date", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({ to: "2025-01-31" }, db);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.date <= "2025-01-31")).toBe(true);
  });

  test("combines multiple filters", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions(
      { from: "2025-01-01", to: "2025-01-31", uncategorized: true },
      db,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe(500000);
  });

  test("uses llmLabel when available, otherwise rawDescription", async () => {
    const db = await seedTestDb();
    const rows = await queryTransactions({}, db);
    // hash1 has llmLabel
    const uberRow = rows.find((r) => r.description === "Uber Eats Delivery");
    expect(uberRow).toBeTruthy();
    // hash2 has no llmLabel, uses rawDescription
    const transferRow = rows.find((r) => r.description === "TRANSFERENCIA RECIBIDA");
    expect(transferRow).toBeTruthy();
  });

  test("printTable prints 'no transactions' message for empty list", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      printTable([]);
    } finally {
      console.log = origLog;
    }
    expect(logs).toContain("No se encontraron transacciones.");
  });

  test("printTable prints table with header and rows", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      printTable([
        {
          date: "2025-01-15",
          description: "UBER EATS",
          amount: -15000,
          categoryName: "Comida",
          status: "confirmed",
        },
      ]);
    } finally {
      console.log = origLog;
    }
    expect(logs[0]).toContain("Fecha");
    expect(logs[0]).toContain("Descripcion");
    expect(logs[0]).toContain("Monto");
    expect(logs.some((l) => l.includes("-$15.000"))).toBe(true);
    expect(logs.some((l) => l.includes("Comida"))).toBe(true);
  });
});

// ---------- Help text ----------

describe("help text", () => {
  test("help output includes all commands", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    expect(output).toContain("finchi setup");
    expect(output).toContain("finchi sync");
    expect(output).toContain("finchi categorize");
    expect(output).toContain("finchi review");
    expect(output).toContain("finchi txns");
    expect(output).toContain("--help");
  });
});
