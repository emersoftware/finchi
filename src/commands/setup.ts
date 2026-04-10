import type { Flags } from "../cli";
import { runSetupInk } from "../tui/setup";

export async function run(flags: Flags): Promise<void> {
  if (flags["no-interactive"]) {
    throw new Error("setup completo requiere interaccion. Usa providers/accounts por CLI para configurar finchi.");
  }
  const result = await runSetupInk("full");
  if (result.action === "dashboard") {
    const mod = await import("./dashboard");
    await mod.run({});
  }
}
