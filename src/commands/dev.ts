import * as p from "@clack/prompts";
import type { Flags } from "../cli";
import { transactions } from "../db/schema";
import { printLogo } from "../tui/logo";
import { spinner } from "../tui/spinner";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function run(_flags: Flags): Promise<void> {
  // Redirect DB before any getDb() call
  process.env.FINCHI_DB_PATH = "./finchi-dev.db";

  const { getDb } = await import("../db/index");
  const db = getDb();

  // Seed if empty
  const existing = db.select().from(transactions).limit(1).all();
  if (existing.length === 0) {
    printLogo();
    p.intro("Modo desarrollo");

    const s1 = spinner();
    s1.start("Conectando a Banco Demo...");
    await sleep(1000);
    s1.stop("Conexion exitosa");

    const s2 = spinner();
    s2.start("Importando transacciones...");
    await sleep(1500);
    const { seedMockData } = await import("../dev/seed-mock");
    const { imported, categorized } = seedMockData(db);
    s2.stop(`${imported} transacciones importadas`);

    const s3 = spinner();
    s3.start("Categorizando con IA...");
    await sleep(2000);
    s3.stop(`${categorized} transacciones categorizadas`);

    p.note(
      `${imported} transacciones importadas\n${categorized} categorizadas`,
      "Resumen",
    );
    p.outro("Datos de prueba cargados");
  }

  // Launch dashboard
  const { render } = await import("ink");
  const React = (await import("react")).default;
  const { DashboardApp } = await import("../tui/app");
  const { waitUntilExit } = render(React.createElement(DashboardApp, { db }));
  await waitUntilExit();
}
