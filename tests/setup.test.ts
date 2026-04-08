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
} from "../src/flows/setup";
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
      const id = await insertAccount(db as any, "bchile", "Banco de Chile");
      expect(id).toBe(1);

      const rows = await db.select().from(accounts).where(eq(accounts.id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].bankId).toBe("bchile");
      expect(rows[0].name).toBe("Banco de Chile");
    });

    it("returns incrementing ids for multiple accounts", async () => {
      const db = createTestDb();
      const id1 = await insertAccount(db as any, "bci", "BCI");
      const id2 = await insertAccount(db as any, "bchile", "Banco de Chile");
      expect(id2).toBeGreaterThan(id1);
    });
  });
});
