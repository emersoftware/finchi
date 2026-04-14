import type { Flags } from "../cli";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { setProviderConfig } from "../domain/configuration";
import { getEnvPath } from "../config";

export async function run(flags: Flags): Promise<void> {
  const provider = getFlagString(flags, "provider");
  const model = getFlagString(flags, "model");
  const apiKey = getFlagString(flags, "api-key");
  const baseUrl = getFlagString(flags, "base-url");
  if (!provider || !model || !apiKey) {
    throw new Error("Debes pasar --provider, --model y --api-key.");
  }

  const snapshot = setProviderConfig(getEnvPath(), provider, model, apiKey, baseUrl);
  if (wantsJson(flags)) {
    printJsonSuccess(snapshot);
    return;
  }

  console.log(`Provider ${snapshot.providerId} configurado con modelo ${snapshot.model}.`);
}
