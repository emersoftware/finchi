import type { Flags } from "../cli";
import { runSetupInk } from "../tui/setup";

export async function run(flags: Flags): Promise<void> {
  if (flags["no-interactive"]) {
    throw new Error("setup bank requiere interaccion. Usa 'finchi accounts add ...' para flujo no interactivo.");
  }
  const result = await runSetupInk("bank");
  if (result.action === "dashboard") {
    const mod = await import("./dashboard");
    await mod.run({});
  }
}
