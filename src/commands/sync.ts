import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { intro, log, outro } from "../tui/console";
import { spinner } from "../tui/spinner";

/** Truncate bank error messages to the first meaningful line. */
function cleanError(error: string): string {
  const firstLine = error.split("\n")[0].trim();
  if (firstLine.startsWith("Error de login")) return "Credenciales incorrectas";
  if (firstLine.length > 80) return firstLine.slice(0, 80) + "...";
  return firstLine;
}

export async function run(_flags: Flags): Promise<void> {
  const db = getDb();

  const { syncAllAccounts } = await import("../sync/sync");
  const { accounts } = await import("../db/schema");
  const allAccounts = db.select().from(accounts).all();

  if (allAccounts.length === 0) {
    log.warning("No hay cuentas configuradas. Ejecuta 'finchi setup' primero.");
    return;
  }

  intro("Sincronizando transacciones");

  let totalImported = 0;
  let totalSkipped = 0;

  for (const account of allAccounts) {
    const s = spinner();
    s.start(`Conectando a ${account.name}...`);

    try {
      const { syncAccount } = await import("../sync/sync");
      const result = await syncAccount(account.id, db);

      if (result.error) {
        s.stop(`${account.name}: ${cleanError(result.error)}`, 1);
      } else {
        s.stop(`${account.name}: ${result.imported} nuevas, ${result.skipped} duplicados`);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      }
    } catch (err) {
      const msg = err instanceof Error ? cleanError(err.message) : "Error desconocido";
      s.stop(`${account.name}: ${msg}`, 1);
    }
  }

  outro(`${totalImported} nuevas transacciones, ${totalSkipped} duplicados omitidos`);
}
