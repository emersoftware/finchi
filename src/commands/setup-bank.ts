import * as p from "@clack/prompts";
import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { spinner } from "../tui/spinner";
import {
  loadBankList,
  toBankOptions,
  writeEnvCredentials,
  insertAccount,
} from "../flows/setup";
import { cleanDescription, convertDate, shouldSkipMovement } from "../sync/normalize";
import { generateHash } from "../sync/dedup";
import { transactions } from "../db/schema";

export async function run(_flags: Flags): Promise<void> {
  p.intro("Agregar banco");

  const banks = await loadBankList();
  const bankId = await p.select({
    message: "Selecciona el banco",
    options: toBankOptions(banks),
  });
  if (p.isCancel(bankId)) { p.cancel("Cancelado."); return; }

  const selectedBank = banks.find((b) => b.id === bankId)!;

  const rut = await p.text({
    message: "Ingresa tu RUT (ej: 12345678-9)",
    validate: (val) => { if (!val?.trim()) return "El RUT es obligatorio"; },
  });
  if (p.isCancel(rut)) { p.cancel("Cancelado."); return; }

  const password = await p.password({
    message: "Ingresa tu clave de internet",
    validate: (val) => { if (!val?.length) return "La clave es obligatoria"; },
  });
  if (p.isCancel(password)) { p.cancel("Cancelado."); return; }

  writeEnvCredentials(".env", bankId, rut, password);
  p.log.success("Credenciales guardadas en .env");

  const db = getDb();
  const accountId = await insertAccount(db, bankId, selectedBank.name);
  p.log.success(`Cuenta creada: ${selectedBank.name}`);

  const s = spinner();
  s.start("Importando transacciones...");

  try {
    const mod = await import("open-banking-chile");
    const bank = mod.getBank?.(bankId);
    if (!bank) { s.stop("Banco no soportado por el scraper"); return; }

    const result = await bank.scrape({ rut, password });
    if (!result?.success || !result.movements?.length) {
      s.stop("No se pudo conectar o no hay transacciones");
      p.outro("Cuenta guardada. Ejecuta 'finchi sync' cuando estes listo.");
      return;
    }

    let imported = 0;
    for (const mv of result.movements) {
      if (shouldSkipMovement(mv)) continue;
      const date = convertDate(mv.date);
      const raw = mv.description;
      const hash = generateHash(accountId, date, raw, mv.amount);
      try {
        await db.insert(transactions).values({
          accountId, hash, date,
          rawDescription: raw,
          cleanDescription: cleanDescription(raw),
          amount: mv.amount,
          balance: mv.balance ?? null,
          source: mv.source ?? null,
        });
        imported++;
      } catch { /* duplicate */ }
    }
    s.stop(`${imported} transacciones importadas`);
  } catch {
    s.stop("Error al conectar con el banco");
  }

  p.outro("Banco agregado! Ejecuta 'finchi categorize' para categorizar.");
}
