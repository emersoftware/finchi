import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { accounts } from "../db/schema";
import { intro, log, outro } from "../tui/console";
import { spinner } from "../tui/spinner";
import { getFlagStrings } from "../cli-flags";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { resolveDateWindow } from "../cli-dates";
import { logHandledError } from "../error-log";

/** Truncate bank error messages to the first meaningful line. */
function cleanError(error: string): string {
  const firstLine = error.split("\n")[0].trim();
  if (firstLine.startsWith("Error de login")) return "Credenciales incorrectas";
  if (firstLine.length > 80) return `${firstLine.slice(0, 80)}...`;
  return firstLine;
}

function parseNumberList(values: string[]): number[] {
  return values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`ID invalido: ${value}`);
      return parsed;
    });
}

export async function run(flags: Flags): Promise<void> {
  const db = getDb();
  const accountIds = parseNumberList(getFlagStrings(flags, "account-id"));
  const bankIds = getFlagStrings(flags, "bank");
  const window = resolveDateWindow(flags);

  let selectedAccounts = await db.select().from(accounts).all();
  if (accountIds.length > 0) {
    selectedAccounts = selectedAccounts.filter((account) => accountIds.includes(account.id));
  }
  if (bankIds.length > 0) {
    selectedAccounts = selectedAccounts.filter((account) => bankIds.includes(account.bankId));
  }

  if (selectedAccounts.length === 0) {
    log.warning("No hay cuentas configuradas o no coinciden con los filtros.");
    return;
  }

  const { syncAccount } = await import("../sync/sync");

  if (wantsJson(flags)) {
    const results = [];
    for (const account of selectedAccounts) {
      try {
        const result = await syncAccount(account.id, db, undefined, { window });
        results.push(result);
      } catch (err) {
        logHandledError(err, {
          flags,
          source: "sync.command.json",
          details: { accountId: account.id, bankId: account.bankId },
        });
        results.push({
          accountId: account.id,
          bankId: account.bankId,
          imported: 0,
          skipped: 0,
          total: 0,
          error: err instanceof Error ? cleanError(err.message) : "Error desconocido",
        });
      }
    }
    printJsonSuccess(results, { effectiveRange: window, count: results.length });
    return;
  }

  intro("Sincronizando transacciones");

  let totalImported = 0;
  let totalSkipped = 0;

  for (const account of selectedAccounts) {
    const s = spinner();
    s.start(`Conectando a ${account.name}...`);

    try {
      const result = await syncAccount(account.id, db, undefined, { window });

      if (result.error) {
        s.stop(`${account.name}: ${cleanError(result.error)}`, 1);
      } else {
        s.stop(`${account.name}: ${result.imported} nuevas, ${result.skipped} duplicados`);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      }
    } catch (err) {
      logHandledError(err, {
        flags,
        source: "sync.command",
        details: { accountId: account.id, bankId: account.bankId },
      });
      const msg = err instanceof Error ? cleanError(err.message) : "Error desconocido";
      s.stop(`${account.name}: ${msg}`, 1);
    }
  }

  outro(`${totalImported} nuevas transacciones, ${totalSkipped} duplicados omitidos`);
}
