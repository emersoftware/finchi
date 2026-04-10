import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { listCategories } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const rows = await listCategories(getDb(), getFlagString(flags, "group"));
  if (wantsJson(flags)) {
    printJsonSuccess(rows, { count: rows.length });
    return;
  }

  if (rows.length === 0) {
    console.log("No hay categorias.");
    return;
  }

  for (const row of rows) {
    console.log(`${row.id}\t${row.group}\t${row.name}`);
  }
}
