import { describe, it, expect, afterEach } from "bun:test";
import { unlinkSync, readFileSync, writeFileSync, existsSync } from "fs";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import {
  loadBankList,
  toBankOptions,
  formatEnvCredentials,
  writeEnvCredentials,
  insertAccount,
  envPrefix,
  getActiveProviderConfig,
  getStartupState,
  resolveStartupState,
} from "../src/flows/setup";
import { resolveInitialSetupStep, resolvePostImportStep } from "../src/tui/setup";
import { accounts } from "../src/db/schema";

const TEST_ENV_PATH = ".env.test.setup";

describe("setup flow helpers", () => {
  afterEach(() => {
    if (existsSync(TEST_ENV_PATH)) {
      unlinkSync(TEST_ENV_PATH);
    }
  });

  // -----------------------------------------------------------------------
  // Bank list
  // -----------------------------------------------------------------------
  describe("loadBankList", () => {
    it("returns a non-empty array of banks", async () => {
      const banks = await loadBankList();
      expect(banks.length).toBeGreaterThan(0);
      expect(banks[0]).toHaveProperty("id");
      expect(banks[0]).toHaveProperty("name");
    });

    it("includes Banco Falabella in fallback list", async () => {
      const banks = await loadBankList();
      const falabella = banks.find((b) => b.id === "falabella");
      expect(falabella).toBeDefined();
      expect(falabella!.name).toBe("Banco Falabella");
    });
  });

  describe("toBankOptions", () => {
    it("formats banks as clack select options", () => {
      const banks = [
        { id: "bchile", name: "Banco de Chile" },
        { id: "bci", name: "BCI" },
      ];
      const options = toBankOptions(banks);
      expect(options).toEqual([
        { value: "bchile", label: "Banco de Chile" },
        { value: "bci", label: "BCI" },
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(toBankOptions([])).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Env prefix
  // -----------------------------------------------------------------------
  describe("envPrefix", () => {
    it("uppercases and replaces hyphens", () => {
      expect(envPrefix("banco-falabella")).toBe("BANCO_FALABELLA");
      expect(envPrefix("bci")).toBe("BCI");
    });
  });

  // -----------------------------------------------------------------------
  // Credential formatting and writing
  // -----------------------------------------------------------------------
  describe("formatEnvCredentials", () => {
    it("produces correct env var lines", () => {
      const result = formatEnvCredentials("bchile", "12345678-9", "secret123");
      expect(result).toBe("BCHILE_RUT=12345678-9\nBCHILE_PASS=secret123\n");
    });

    it("handles hyphenated bank ids", () => {
      const result = formatEnvCredentials("banco-estado", "11111111-1", "pw");
      expect(result).toContain("BANCO_ESTADO_RUT=11111111-1");
      expect(result).toContain("BANCO_ESTADO_PASS=pw");
    });
  });

  describe("writeEnvCredentials", () => {
    it("creates .env file if it does not exist", () => {
      writeEnvCredentials(TEST_ENV_PATH, "bci", "12345678-9", "pass");
      const content = readFileSync(TEST_ENV_PATH, "utf-8");
      expect(content).toContain("BCI_RUT=12345678-9");
      expect(content).toContain("BCI_PASS=pass");
    });

    it("appends to existing .env without duplicating newlines", () => {
      writeFileSync(TEST_ENV_PATH, "EXISTING_VAR=hello\n");
      writeEnvCredentials(TEST_ENV_PATH, "bci", "12345678-9", "pass");
      const content = readFileSync(TEST_ENV_PATH, "utf-8");
      expect(content).toBe("EXISTING_VAR=hello\nBCI_RUT=12345678-9\nBCI_PASS=pass\n");
    });

    it("adds newline separator when existing file lacks trailing newline", () => {
      writeFileSync(TEST_ENV_PATH, "EXISTING_VAR=hello");
      writeEnvCredentials(TEST_ENV_PATH, "bci", "12345678-9", "pass");
      const content = readFileSync(TEST_ENV_PATH, "utf-8");
      expect(content).toBe("EXISTING_VAR=hello\nBCI_RUT=12345678-9\nBCI_PASS=pass\n");
    });
  });

  // -----------------------------------------------------------------------
  // Account insertion
  // -----------------------------------------------------------------------
  describe("insertAccount", () => {
    it("inserts a row and returns the new id", async () => {
      const db = createTestDb();
      const id = await insertAccount(db as any, "bchile", "Cuenta principal");
      expect(id).toBe(1);

      const rows = await db.select().from(accounts).where(eq(accounts.id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].bankId).toBe("bchile");
      expect(rows[0].name).toBe("Cuenta principal");
    });

    it("returns incrementing ids for multiple accounts", async () => {
      const db = createTestDb();
      const id1 = await insertAccount(db as any, "bci", "BCI");
      const id2 = await insertAccount(db as any, "bchile", "Banco de Chile");
      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe("getActiveProviderConfig", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("returns null when no active provider is configured", () => {
      delete process.env.LLM_PROVIDER;
      delete process.env.LLM_MODEL;
      delete process.env.ANTHROPIC_API_KEY;
      expect(getActiveProviderConfig()).toBeNull();
    });

    it("returns provider and model when active provider is configured", () => {
      process.env.LLM_PROVIDER = "openai";
      process.env.LLM_MODEL = "gpt-4.1-mini";
      process.env.OPENAI_API_KEY = "test-key";
      const result = getActiveProviderConfig();
      expect(result).toBeTruthy();
      expect(result?.provider.id).toBe("openai");
      expect(result?.model).toBe("gpt-4.1-mini");
    });
  });

  describe("resolveStartupState", () => {
    it("opens dashboard when provider and account are configured", () => {
      expect(resolveStartupState(true, true)).toBe("dashboard");
    });

    it("asks for provider when there are accounts but no provider", () => {
      expect(resolveStartupState(true, false)).toBe("missingProvider");
    });

    it("forces bank onboarding when there is provider but no account", () => {
      expect(resolveStartupState(false, true)).toBe("missingAccount");
    });

    it("keeps full onboarding when nothing is configured", () => {
      expect(resolveStartupState(false, false)).toBe("full");
    });
  });

  describe("getStartupState", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("reads accounts from db and provider config from env", async () => {
      const db = createTestDb();
      await insertAccount(db as any, "bchile", "Cuenta principal");
      process.env.LLM_PROVIDER = "openai";
      process.env.LLM_MODEL = "gpt-4.1-mini";
      process.env.OPENAI_API_KEY = "test-key";

      expect(getStartupState(db as any)).toBe("dashboard");
    });
  });

  describe("resolveInitialSetupStep", () => {
    it("opens existing-account action when full setup already has account and provider", () => {
      expect(resolveInitialSetupStep("full", true, true)).toBe("existingAccountAction");
    });

    it("asks for provider when full setup has account but no provider", () => {
      expect(resolveInitialSetupStep("full", true, false)).toBe("missingProviderAction");
    });

    it("forces bank setup when provider exists but account is missing", () => {
      expect(resolveInitialSetupStep("full", false, true)).toBe("missingAccountAction");
    });

    it("starts at provider flow for model-only setup without active provider", () => {
      expect(resolveInitialSetupStep("model", false, false)).toBe("provider");
    });

    it("starts at bank picker for bank-only setup regardless of existing state", () => {
      expect(resolveInitialSetupStep("bank", true, true)).toBe("bank");
    });
  });

  describe("resolvePostImportStep", () => {
    it("goes to categorize prompt after importing transactions with provider", () => {
      expect(resolvePostImportStep("full", 2, true)).toBe("categorizePrompt");
    });

    it("goes to missing-provider prompt after importing transactions without provider", () => {
      expect(resolvePostImportStep("full", 2, false)).toBe("missingProviderAction");
    });

    it("goes to summary for bank-only setup", () => {
      expect(resolvePostImportStep("bank", 2, false)).toBe("summary");
    });

    it("goes to summary when no new transactions and provider already exists", () => {
      expect(resolvePostImportStep("full", 0, true)).toBe("summary");
    });

    it("goes to missing-provider prompt when no new transactions and provider is missing", () => {
      expect(resolvePostImportStep("full", 0, false)).toBe("missingProviderAction");
    });
  });
});
