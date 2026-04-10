import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { listAccounts } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const rows = await listAccounts(getDb());
  if (wantsJson(flags)) {
    printJsonSuccess(rows, { count: rows.length });
    return;
  }

  if (rows.length === 0) {
    console.log("No hay cuentas configuradas.");
    return;
  }

  for (const row of rows) {
    console.log(`${row.id}\t${row.bankId}\t${row.name}`);
  }
}
