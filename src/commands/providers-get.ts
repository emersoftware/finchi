import type { Flags } from "../cli";
import { printJsonSuccess, printKeyValue, wantsJson } from "../cli-output";
import { getProviderSnapshot } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const provider = getProviderSnapshot();
  if (wantsJson(flags)) {
    printJsonSuccess(provider);
    return;
  }

  if (!provider) {
    console.log("No hay provider activo.");
    return;
  }

  printKeyValue([
    ["Provider", provider.providerId],
    ["Model", provider.model],
    ["Env key", provider.envKey],
    ["Base URL", provider.baseUrl],
  ]);
}
