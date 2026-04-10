import { existsSync, unlinkSync } from "fs";
import type { Flags } from "../cli";
import type { Db } from "../db/index";
import { transactions } from "../db/schema";
import { getStartupState } from "../flows/setup";
import { printLogo } from "../tui/logo";
import { intro, note, outro } from "../tui/console";
import { spinner } from "../tui/spinner";
import { parseDevScenarioFlags, isDevScenarioMode, prepareDevScenario, validateDevScenarioOptions } from "../dev/scenario";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function renderDashboard(db: Db) {
  const { render } = await import("ink");
  const React = (await import("react")).default;
  const { DashboardApp } = await import("../tui/app");
  const { waitUntilExit } = render(React.createElement(DashboardApp, { db }));
  await waitUntilExit();
}

export async function run(flags: Flags): Promise<void> {
  const scenario = parseDevScenarioFlags(flags);
  const scenarioMode = isDevScenarioMode(scenario);
  const validationError = validateDevScenarioOptions(scenario);
  if (validationError) {
    throw new Error(validationError);
  }

  const dbPath = scenarioMode ? "./finchi-dev-scenario.db" : "./finchi-dev.db";
  process.env.FINCHI_DB_PATH = dbPath;
  if (scenarioMode && existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const { getDb } = await import("../db/index");
  const db = getDb();

  if (scenarioMode) {
    const setupOptions = await prepareDevScenario(db, scenario);
    if (scenario.setupMode) {
      const { runSetupInk } = await import("../tui/setup");
      const result = await runSetupInk(scenario.setupMode, setupOptions);
      if (result.action === "dashboard") {
        await renderDashboard(db);
      }
      return;
    }

    const startupState = getStartupState(db);
    if (startupState === "dashboard") {
      await renderDashboard(db);
      return;
    }

    const { runSetupInk } = await import("../tui/setup");
    const result = await runSetupInk("full", setupOptions);
    if (result.action === "dashboard") {
      await renderDashboard(db);
    }
    return;
  }

  // Seed if empty
  const existing = db.select().from(transactions).limit(1).all();
  if (existing.length === 0) {
    printLogo();
    intro("Modo desarrollo");

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

    note(
      `${imported} transacciones importadas\n${categorized} categorizadas`,
      "Resumen",
    );
    outro("Datos de prueba cargados");
  }

  await renderDashboard(db);
}
