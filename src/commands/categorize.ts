import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { loadConfig } from "../config";
import { intro, log, outro } from "../tui/console";
import { spinner } from "../tui/spinner";

export async function run(_flags: Flags): Promise<void> {
  const db = getDb();
  const config = loadConfig();

  intro("Categorizando transacciones");

  const s = spinner();
  s.start("Buscando transacciones pendientes...");

  try {
    const { categorizeTransactions } = await import("../categorize/classify");
    const result = await categorizeTransactions(db, config);

    const total = result.fuzzyMatched + result.llmCategorized;
    if (total === 0 && result.failed === 0) {
      s.stop("No hay transacciones pendientes de categorizar");
    } else {
      const parts: string[] = [];
      if (result.fuzzyMatched > 0) parts.push(`${result.fuzzyMatched} por historial`);
      if (result.llmCategorized > 0) parts.push(`${result.llmCategorized} por IA`);
      if (result.failed > 0) parts.push(`${result.failed} sin categorizar`);
      s.stop(parts.join(", "));
    }

    if (result.error) {
      log.warning(result.error);
    }

    if (total > 0) {
      outro("Ejecuta 'finchi review' para revisar las categorias.");
    } else if (result.failed > 0) {
      outro("No se pudieron categorizar. Revisa tu configuracion con 'finchi setup provider'.");
    } else {
      outro("No hay transacciones pendientes.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    s.stop(`Error: ${msg}`, 1);
  }
}
