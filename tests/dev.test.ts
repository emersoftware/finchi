import { afterEach, describe, expect, it } from "bun:test";
import { createTestDb } from "./helpers";
import { accounts, transactions } from "../src/db/schema";
import { getStartupState } from "../src/flows/setup";
import {
  isDevScenarioMode,
  parseDevScenarioFlags,
  prepareDevScenario,
  validateDevScenarioOptions,
} from "../src/dev/scenario";

describe("dev scenarios", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parses composable dev flags", () => {
    const options = parseDevScenarioFlags({
      "with-account": true,
      "with-provider": true,
      "setup-mode": "full",
      "empty-import": true,
    });
    expect(options).toEqual({
      withAccount: true,
      withProvider: true,
      withTransactions: false,
      emptyImport: true,
      setupMode: "full",
    });
  });

  it("detects when dev scenario mode should activate", () => {
    expect(isDevScenarioMode({
      withAccount: false,
      withProvider: false,
      withTransactions: false,
      emptyImport: false,
    })).toBe(false);

    expect(isDevScenarioMode({
      withAccount: true,
      withProvider: false,
      withTransactions: false,
      emptyImport: false,
    })).toBe(true);
  });

  it("validates impossible dev flag combinations", () => {
    expect(validateDevScenarioOptions({
      withAccount: false,
      withProvider: false,
      withTransactions: true,
      emptyImport: false,
    })).toBe("with-transactions requiere with-account.");

    expect(validateDevScenarioOptions({
      withAccount: false,
      withProvider: false,
      withTransactions: false,
      emptyImport: true,
      setupMode: "model",
    })).toBe("empty-import no aplica a setup-mode model.");
  });

  it("prepares a missing-provider scenario from an isolated db", async () => {
    const db = createTestDb();
    await prepareDevScenario(db as any, {
      withAccount: true,
      withProvider: false,
      withTransactions: false,
      emptyImport: false,
    });

    expect(db.select().from(accounts).all()).toHaveLength(1);
    expect(getStartupState(db as any)).toBe("missingProvider");
  });

  it("prepares transactions and an in-memory provider", async () => {
    const db = createTestDb();
    const setupOptions = await prepareDevScenario(db as any, {
      withAccount: true,
      withProvider: true,
      withTransactions: true,
      emptyImport: false,
      setupMode: "full",
    });

    expect(db.select().from(accounts).all()).toHaveLength(1);
    expect(db.select().from(transactions).all().length).toBeGreaterThan(0);
    expect(getStartupState(db as any)).toBe("dashboard");

    const scrapeResult = await setupOptions.scrapeBank?.("banco-dev", "1-9", "secret");
    expect(scrapeResult?.movements.length).toBeGreaterThan(0);
  });

  it("can force empty imports for setup testing", async () => {
    const db = createTestDb();
    const setupOptions = await prepareDevScenario(db as any, {
      withAccount: false,
      withProvider: false,
      withTransactions: false,
      emptyImport: true,
      setupMode: "bank",
    });

    const scrapeResult = await setupOptions.scrapeBank?.("banco-dev", "1-9", "secret");
    expect(scrapeResult).toEqual({ movements: [] });
  });
});
