import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { sanitizeArgv, sanitizeErrorLogText, sanitizeFlags } from "../src/error-log";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "finchi-error-log-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("error log sanitization", () => {
  test("redacts sensitive flags and env-like secrets", () => {
    expect(sanitizeFlags({
      "api-key": "sk-secret",
      password: "secret",
      provider: "openai",
    })).toEqual({
      "api-key": "[REDACTED]",
      password: "[REDACTED]",
      provider: "openai",
    });

    expect(sanitizeArgv([
      "bun",
      "src/cli.ts",
      "providers",
      "set",
      "--api-key",
      "sk-secret",
      "--password=topsecret",
    ])).toEqual([
      "bun",
      "src/cli.ts",
      "providers",
      "set",
      "--api-key",
      "[REDACTED]",
      "--password=[REDACTED]",
    ]);

    expect(sanitizeErrorLogText("OPENAI_API_KEY=sk-secret password=hola sk-12345")).toBe(
      "OPENAI_API_KEY=[REDACTED] password=[REDACTED] [REDACTED]",
    );
  });
});

describe("cli error logging", () => {
  test("writes NDJSON logs and prints hint for command failures", async () => {
    const home = makeTempDir();
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "providers", "set"], {
      cwd: import.meta.dir + "/..",
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const logPath = join(home, ".finchi", "logs", "errors.ndjson");

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: Debes pasar --provider, --model y --api-key.");
    expect(stderr).toContain(`Log guardado en ${logPath}.`);
    expect(existsSync(logPath)).toBe(true);

    const entries = readFileSync(logPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    expect(entries).toHaveLength(1);
    expect(entries[0].error.message).toBe("Debes pasar --provider, --model y --api-key.");
    expect(entries[0].version).toBe("1.1.1");
  });

  test("includes logPath in json failures", async () => {
    const home = makeTempDir();
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "providers", "set", "--json"], {
      cwd: import.meta.dir + "/..",
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const payload = JSON.parse(stderr);

    expect(exitCode).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe("Debes pasar --provider, --model y --api-key.");
    expect(payload.error.details.logPath).toBe(join(home, ".finchi", "logs", "errors.ndjson"));
  });

  test("logs startup errors from the root command path", async () => {
    const home = makeTempDir();
    const proc = Bun.spawn(["bun", "run", "src/cli.ts"], {
      cwd: import.meta.dir + "/..",
      env: {
        ...process.env,
        HOME: home,
        FINCHI_DB_PATH: "/dev/null/finchi.db",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const logPath = join(home, ".finchi", "logs", "errors.ndjson");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Ejecuta 'finchi setup' para comenzar.");
    expect(stderr).toContain(`Log guardado en ${logPath}.`);
    expect(existsSync(logPath)).toBe(true);

    const [entry] = readFileSync(logPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    expect(entry.error.message.length).toBeGreaterThan(0);
  });
});
