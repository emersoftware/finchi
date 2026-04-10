import type { Flags } from "../cli";
import { runSetupInk } from "../tui/setup";

export async function run(flags: Flags): Promise<void> {
  if (flags["no-interactive"]) {
    throw new Error("setup model requiere interaccion. Usa 'finchi providers set ...' para flujo no interactivo.");
  }
  await runSetupInk("model");
}
