import type { Flags } from "../cli";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { listSupportedBanks } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const banks = await listSupportedBanks();
  if (wantsJson(flags)) {
    printJsonSuccess(banks, { count: banks.length });
    return;
  }

  for (const bank of banks) {
    console.log(`${bank.id}\t${bank.name}`);
  }
}
