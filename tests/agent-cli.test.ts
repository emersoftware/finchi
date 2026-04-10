import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseArgs } from "../src/cli";
import { buildTransactionFilters } from "../src/commands/txns";
import { createTestDb } from "./helpers";
import { accounts, categories, transactions, categorizationHistory } from "../src/db/schema";
import {
  addAccount,
  addCategory,
  clearProviderConfig,
  getProviderSnapshot,
  listCategories,
  listCategoryGroups,
  setProviderConfig,
  updateCategory,
} from "../src/domain/configuration";
import { updateTransaction, updateTransactions } from "../src/domain/transactions";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "finchi-agent-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("agent cli parsing and filters", () => {
  test("parseArgs accumulates repeated flags", () => {
    const { flags } = parseArgs([
      "bun",
      "cli.ts",
      "txns",
      "list",
      "--group",
      "Comida",
      "--group",
      "Transporte",
      "--account-id",
      "1",
      "--account-id",
      "2",
    ]);

    expect(flags["group"]).toEqual(["Comida", "Transporte"]);
    expect(flags["account-id"]).toEqual(["1", "2"]);
  });

  test("buildTransactionFilters maps month, repeated filters and status", () => {
    const filters = buildTransactionFilters({
      month: "2026-04",
      group: ["Comida", "Transporte"],
      "category-id": ["1", "2"],
      "account-id": "7",
      source: ["bank", "card"],
      status: "pending_review",
      search: "uber",
    });

    expect(filters.from).toBe("2026-04-01");
    expect(filters.to).toBe("2026-04-30");
    expect(filters.groupNames).toEqual(["Comida", "Transporte"]);
    expect(filters.categoryIds).toEqual([1, 2]);
    expect(filters.accountIds).toEqual([7]);
    expect(filters.sources).toEqual(["bank", "card"]);
    expect(filters.status).toBe("pending_review");
    expect(filters.search).toBe("uber");
  });
});

describe("configuration helpers", () => {
  test("setProviderConfig writes and clearProviderConfig removes provider env", () => {
    const envPath = join(makeTempDir(), ".env");

    const snapshot = setProviderConfig(envPath, "openai", "gpt-4.1-mini", "sk-test", "https://example.test/v1");
    expect(snapshot.providerId).toBe("openai");
    expect(snapshot.model).toBe("gpt-4.1-mini");
    expect(getProviderSnapshot()?.providerId).toBe("openai");

    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("LLM_PROVIDER=openai");
    expect(content).toContain("OPENAI_API_KEY=sk-test");
    expect(content).toContain("LLM_BASE_URL=https://example.test/v1");

    clearProviderConfig(envPath);
    const cleared = readFileSync(envPath, "utf-8");
    expect(cleared).not.toContain("LLM_PROVIDER=");
    expect(cleared).not.toContain("OPENAI_API_KEY=");
  });

  test("addAccount supports memory-only and env persistence", async () => {
    const db = createTestDb();
    const envPath = join(makeTempDir(), ".env");

    const memoryAccount = await addAccount(db, {
      bankId: "bci",
      name: "Cuenta memoria",
      rut: "12345678-9",
      password: "secret",
      envPath: null,
    });
    expect(memoryAccount.savedCredentials).toBe("memory");

    const envAccount = await addAccount(db, {
      bankId: "santander",
      name: "Cuenta env",
      rut: "98765432-1",
      password: "topsecret",
      envPath,
    });
    expect(envAccount.savedCredentials).toBe("env");
    expect(readFileSync(envPath, "utf-8")).toContain("SANTANDER_RUT=98765432-1");
  });

  test("categories expose groups and can be filtered/updated", async () => {
    const db = createTestDb();
    await addCategory(db, { name: "Restaurantes", group: "Comida", emoji: "" });
    await addCategory(db, { name: "Metro", group: "Transporte", emoji: "" });

    const groups = await listCategoryGroups(db);
    expect(groups).toEqual(["Comida", "Transporte"]);

    const food = await listCategories(db, "Comida");
    expect(food).toHaveLength(1);
    expect(food[0].name).toBe("Restaurantes");

    const updated = await updateCategory(db, food[0].id, { group: "Salidas", excludeFromSummary: true });
    expect(updated.group).toBe("Salidas");
    expect(updated.excludeFromSummary).toBe(true);
  });
});

describe("transaction mutation helpers", () => {
  async function seedDb() {
    const db = createTestDb();
    await db.insert(accounts).values({ bankId: "bci", name: "Cuenta principal" });
    await db.insert(categories).values([
      { name: "Comida", group: "Gastos", emoji: "" },
      { name: "Transporte", group: "Gastos", emoji: "" },
    ]);
    await db.insert(transactions).values([
      {
        accountId: 1,
        hash: "txn-1",
        date: "2026-04-10",
        rawDescription: "UBER EATS",
        cleanDescription: "uber eats",
        amount: -15000,
        status: "pending_review",
        categoryId: 1,
      },
      {
        accountId: 1,
        hash: "txn-2",
        date: "2026-04-11",
        rawDescription: "METRO",
        cleanDescription: "metro",
        amount: -1000,
        status: "uncategorized",
      },
    ]);
    return db;
  }

  test("updateTransaction stores category history with old and new category ids", async () => {
    const db = await seedDb();
    await updateTransaction(db, 1, { categoryId: 2, llmLabel: "Uber Eats", status: "confirmed" });

    const updated = await db.select().from(transactions).where(eq(transactions.id, 1)).get();
    expect(updated?.categoryId).toBe(2);
    expect(updated?.llmLabel).toBe("Uber Eats");
    expect(updated?.status).toBe("confirmed");

    const history = await db.select().from(categorizationHistory).all();
    expect(history).toHaveLength(1);
    expect(history[0].oldCategoryId).toBe(1);
    expect(history[0].newCategoryId).toBe(2);
  });

  test("updateTransactions applies bulk status changes", async () => {
    const db = await seedDb();
    const count = await updateTransactions(db, [1, 2], { status: "confirmed" });
    expect(count).toBe(2);

    const rows = await db.select().from(transactions).all();
    expect(rows.every((row) => row.status === "confirmed")).toBe(true);
  });
});

describe("cli help smoke", () => {
  test("help categories documents groups", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "help", "categories"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    expect(output).toContain("finchi categories groups");
    expect(output).toContain("--group <name>");
  });
});
