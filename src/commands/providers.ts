import type { Flags } from "../cli";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { listProviders } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const rows = listProviders();
  if (wantsJson(flags)) {
    printJsonSuccess(rows, { count: rows.length });
    return;
  }

  for (const row of rows) {
    console.log(`${row.id}\t${row.name}\t${row.models[0]}`);
  }
}
