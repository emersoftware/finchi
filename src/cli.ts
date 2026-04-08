#!/usr/bin/env bun

/** CLI entry point for finchi -- personal finance tracker for Chilean banks. */

const HELP_TEXT = `
finchi - Finanzas personales para bancos chilenos

Uso:
  finchi                       Abrir dashboard (o setup si es primera vez)
  finchi setup                 Configuracion inicial (primera vez)
  finchi setup bank            Agregar un banco nuevo
  finchi setup model           Configurar proveedor de IA
  finchi sync                  Sincronizar transacciones
  finchi sync --3m             Sincronizar ultimos 3 meses
  finchi categorize            Categorizar transacciones pendientes
  finchi review                Revisar categorizaciones
  finchi txns                  Listar transacciones
  finchi txns --uncategorized  Solo sin categorizar
  finchi txns --category <n>   Filtrar por categoria
  finchi txns --from <fecha>   Desde fecha (YYYY-MM-DD)
  finchi txns --to <fecha>     Hasta fecha (YYYY-MM-DD)
  finchi dev                    Abrir dashboard con datos de prueba
  finchi --help, -h            Mostrar esta ayuda
`.trim();

export type Flags = Record<string, string | boolean>;

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
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      flags[key] = true;
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
  "setup model": () => import("./commands/setup-model"),
  review: () => import("./commands/review"),
  dashboard: () => import("./commands/dashboard"),
  dev: () => import("./commands/dev"),
};

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (flags["help"] || flags["h"]) {
    console.log(HELP_TEXT);
    return;
  }

  if (command === "help") {
    console.log(HELP_TEXT);
    return;
  }

  if (!command) {
    // Default: check if accounts exist -> dashboard or setup
    try {
      const { getDb } = await import("./db/index");
      const { accounts } = await import("./db/schema");
      const db = getDb();
      const rows = await db.select().from(accounts).limit(1);
      if (rows.length === 0) {
        const mod = await COMMANDS["setup"]();
        await mod.run(flags);
      } else {
        const mod = await COMMANDS["dashboard"]();
        await mod.run(flags);
      }
    } catch {
      console.log("Ejecuta 'finchi setup' para comenzar.");
    }
    return;
  }

  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Comando desconocido: ${command}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }

  const mod = await loader();
  await mod.run(flags);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
