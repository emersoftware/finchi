#!/usr/bin/env bun

/** CLI entry point for finchi -- personal finance tracker for Chilean banks. */

import { appendFlagValue, type Flags } from "./cli-flags";
export type { Flags } from "./cli-flags";
import { printJsonFailure, wantsJson } from "./cli-output";
import { getErrorLogHint, sanitizeErrorForUser, writeErrorLog } from "./error-log";

const HELP_TOPICS: Record<string, string> = {
  default: `
finchi - Finanzas personales para bancos chilenos

Uso:
  finchi                               Abrir onboarding o dashboard segun tu setup
  finchi help [topic]                  Mostrar ayuda general o por dominio

Dominios:
  finchi sync [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--month YYYY-MM] [--json]
  finchi txns [list] [filtros...] [--json]
  finchi txns get --id <id> [--json]
  finchi txns edit --id <id> [--category-id <id>] [--label <txt>] [--status <s>] [--json]
  finchi txns bulk-edit [filtros...] [--set-category-id <id>] [--set-status <s>] [--json]
  finchi dashboard summary [filtros...] [--json]
  finchi review [list|confirm|bulk-confirm] [--json]
  finchi providers [list|get|set|clear] [--json]
  finchi accounts [banks|list|add|edit|remove] [--json]
  finchi categories [groups|list|get|add|edit] [--json]
  finchi config show [--json]

Setup interactivo:
  finchi setup
  finchi setup bank
  finchi setup provider

Otros:
  finchi categorize
  finchi dev
  finchi --help, -h

Ejemplos:
  finchi sync --month 2026-03 --json
  finchi txns list --from 2026-03-01 --to 2026-03-31 --group Comida --json
  finchi providers set --provider openai --model gpt-4.1-mini --api-key sk-... --json
  finchi accounts add --bank bci --name "Cuenta BCI" --rut 12345678-9 --password secret --json
`.trim(),
  sync: `
finchi help sync

Uso:
  finchi sync [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  finchi sync --month YYYY-MM
  finchi sync --1m | --3m | --6m | --12m
  finchi sync [--account-id <id>] [--bank <bank-id>] [--json]

Notas:
  - La insercion sigue siendo idempotente por hash.
  - Si el scraper no soporta rangos, finchi filtra localmente antes de insertar.
`.trim(),
  txns: `
finchi help txns

Uso:
  finchi txns list [filtros...] [--json]
  finchi txns get --id <id> [--json]
  finchi txns edit --id <id> [--category-id <id>|--category <name>] [--label <txt>] [--status <s>] [--source <s>] [--json]
  finchi txns bulk-edit [--ids <id,id,...>|filtros...] [--set-category-id <id>|--set-category <name>] [--set-status <s>] [--json]

Filtros:
  --from YYYY-MM-DD
  --to YYYY-MM-DD
  --month YYYY-MM
  --category <name>
  --category-id <id>         Repetible
  --group <name>             Repetible
  --account <name>
  --account-id <id>          Repetible
  --source <name>            Repetible
  --type income|expense
  --status uncategorized|pending_review|confirmed
  --search <texto>
`.trim(),
  accounts: `
finchi help accounts

Uso:
  finchi accounts banks [--json]
  finchi accounts list [--json]
  finchi accounts add --bank <bank-id> --name <alias> --rut <rut> --password <pass> [--save env|memory] [--json]
  finchi accounts edit --id <id> --name <alias> [--json]
  finchi accounts remove --id <id> [--json]
`.trim(),
  providers: `
finchi help providers

Uso:
  finchi providers list [--json]
  finchi providers get [--json]
  finchi providers set --provider <id> --model <model> --api-key <key> [--base-url <url>] [--json]
  finchi providers clear [--json]
`.trim(),
  categories: `
finchi help categories

Uso:
  finchi categories groups [--json]
  finchi categories list [--group <name>] [--json]
  finchi categories get --id <id> [--json]
  finchi categories add --name <name> --group <group> [--emoji <emoji>] [--exclude-from-summary true|false] [--json]
  finchi categories edit --id <id> [--name <name>] [--group <group>] [--emoji <emoji>] [--exclude-from-summary true|false] [--json]
`.trim(),
  review: `
finchi help review

Uso:
  finchi review                 Abrir la UI de revision
  finchi review list [--json]
  finchi review confirm --id <id> [--json]
  finchi review bulk-confirm --ids <id,id,...>|--all [--json]
`.trim(),
};

export function getHelpText(topic?: string): string {
  if (!topic) return HELP_TOPICS.default;
  return HELP_TOPICS[topic] ?? HELP_TOPICS.default;
}

/**
 * Parse argv into a command name and a flags map.
 * Flags: --foo bar -> { foo: "bar" }, --flag (no value) -> { flag: true }
 */
export function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const args = argv.slice(2); // skip bun + script path
  let command = "";
  const flags: Flags = {};

  let i = 0;
  // Collect non-flag arguments as command parts (e.g. "setup bank" -> "setup bank")
  const commandParts: string[] = [];
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) break;
    commandParts.push(arg);
    i++;
  }
  command = commandParts.join(" ");

  // Remaining args are flags
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        appendFlagValue(flags, key, next);
        i += 2;
      } else {
        appendFlagValue(flags, key, true);
        i++;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      appendFlagValue(flags, key, true);
      i++;
    } else {
      i++;
    }
  }

  return { command, flags };
}

type CommandHandler = (flags: Flags) => Promise<void>;

const COMMANDS: Record<string, () => Promise<{ run: CommandHandler }>> = {
  txns: () => import("./commands/txns"),
  sync: () => import("./commands/sync"),
  categorize: () => import("./commands/categorize"),
  setup: () => import("./commands/setup"),
  "setup bank": () => import("./commands/setup-bank"),
  "setup provider": () => import("./commands/setup-model"),
  "setup model": () => import("./commands/setup-model"),
  review: () => import("./commands/review"),
  "review list": () => import("./commands/review-list"),
  "review confirm": () => import("./commands/review-confirm"),
  "review bulk-confirm": () => import("./commands/review-bulk-confirm"),
  dashboard: () => import("./commands/dashboard"),
  "dashboard summary": () => import("./commands/dashboard-summary"),
  dev: () => import("./commands/dev"),
  "txns list": () => import("./commands/txns"),
  "txns get": () => import("./commands/txns-get"),
  "txns edit": () => import("./commands/txns-edit"),
  "txns bulk-edit": () => import("./commands/txns-bulk-edit"),
  accounts: () => import("./commands/accounts"),
  "accounts list": () => import("./commands/accounts"),
  "accounts banks": () => import("./commands/accounts-banks"),
  "accounts add": () => import("./commands/accounts-add"),
  "accounts edit": () => import("./commands/accounts-edit"),
  "accounts remove": () => import("./commands/accounts-remove"),
  providers: () => import("./commands/providers"),
  "providers list": () => import("./commands/providers"),
  "providers get": () => import("./commands/providers-get"),
  "providers set": () => import("./commands/providers-set"),
  "providers clear": () => import("./commands/providers-clear"),
  categories: () => import("./commands/categories"),
  "categories list": () => import("./commands/categories"),
  "categories groups": () => import("./commands/categories-groups"),
  "categories get": () => import("./commands/categories-get"),
  "categories add": () => import("./commands/categories-add"),
  "categories edit": () => import("./commands/categories-edit"),
  "config show": () => import("./commands/config-show"),
};

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (flags["help"] || flags["h"]) {
    console.log(getHelpText(command || undefined));
    return;
  }

  if (command === "help" || command.startsWith("help ")) {
    const topic = command.startsWith("help ") ? command.slice(5) : undefined;
    console.log(getHelpText(topic));
    return;
  }

  if (!command) {
    try {
      const { getStartupState } = await import("./flows/setup");
      const startupState = getStartupState();
      const mod = startupState === "dashboard"
        ? await COMMANDS["dashboard"]()
        : await COMMANDS["setup"]();
      await mod.run(flags);
    } catch (err) {
      const logPath = writeErrorLog(err, flags);
      console.log("Ejecuta 'finchi setup' para comenzar.");
      console.error(getErrorLogHint(logPath));
    }
    return;
  }

  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Comando desconocido: ${command}`);
    console.log(getHelpText());
    process.exit(1);
  }

  const mod = await loader();
  await mod.run(flags);
}

if (import.meta.main) {
  main().catch((err) => {
    const { flags } = parseArgs(process.argv);
    const logPath = writeErrorLog(err, flags);
    const message = sanitizeErrorForUser(err);
    if (wantsJson(flags)) {
      printJsonFailure("command_failed", message, { logPath });
    } else {
      console.error("Error:", message);
      console.error(getErrorLogHint(logPath));
    }
    process.exit(1);
  });
}
