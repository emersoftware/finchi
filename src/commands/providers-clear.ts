import type { Flags } from "../cli";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { clearProviderConfig } from "../domain/configuration";
import { getEnvPath } from "../config";

export async function run(flags: Flags): Promise<void> {
  clearProviderConfig(getEnvPath());
  if (wantsJson(flags)) {
    printJsonSuccess({ cleared: true });
    return;
  }

  console.log("Provider limpiado.");
}
