import type { Flags } from "../cli";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { clearProviderConfig } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  clearProviderConfig(".env");
  if (wantsJson(flags)) {
    printJsonSuccess({ cleared: true });
    return;
  }

  console.log("Provider limpiado.");
}
