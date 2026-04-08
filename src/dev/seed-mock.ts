import { eq } from "drizzle-orm";
import { accounts, categories, transactions, categorizationHistory } from "../db/schema";
import { generateHash } from "../sync/dedup";
import type { Db } from "../db";

/** Format a Date as YYYY-MM-DD. */
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Subtract days from a date and return a new Date. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// Mock transaction templates
// ---------------------------------------------------------------------------

interface MockTxn {
  dayOffset: number;
  raw: string;
  clean: string;
  amount: number;
  source: string;
  account: 1 | 2;
  category: string | null;
  status: "confirmed" | "pending_review" | "uncategorized";
  suggestedBy: "human" | "llm" | "fuzzy" | null;
  confidence: number | null;
  llmLabel: string | null;
  balance?: number | null;
}

const MOCK_TXNS: MockTxn[] = [
  // --- Income (confirmed) ---
  { dayOffset: 42, raw: "DEPOSITO SUELDO MENSUAL", clean: "deposito sueldo mensual", amount: 1200000, source: "account", account: 1, category: "Sueldo", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Deposito de sueldo" },
  { dayOffset: 12, raw: "DEPOSITO SUELDO MENSUAL", clean: "deposito sueldo mensual", amount: 1200000, source: "account", account: 1, category: "Sueldo", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Deposito de sueldo" },
  { dayOffset: 28, raw: "ABONO HONORARIOS PROYECTO", clean: "abono honorarios proyecto", amount: 350000, source: "account", account: 1, category: "Freelance/Honorarios", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Pago de honorarios" },

  // --- Arriendo (confirmed) ---
  { dayOffset: 40, raw: "PAG ARRIENDO DEPTO", clean: "pag arriendo depto", amount: -350000, source: "account", account: 1, category: "Arriendo", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Pago arriendo departamento" },
  { dayOffset: 10, raw: "PAG ARRIENDO DEPTO", clean: "pag arriendo depto", amount: -350000, source: "account", account: 1, category: "Arriendo", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Pago arriendo departamento" },

  // --- Restaurantes (mix) ---
  { dayOffset: 43, raw: "COMPRA RESTAURANTE CENTRO", clean: "compra restaurante centro", amount: -12000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Almuerzo restaurante" },
  { dayOffset: 38, raw: "COMPRA RESTAURANTE COSTANERA", clean: "compra restaurante costanera", amount: -18000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Cena restaurante" },
  { dayOffset: 35, raw: "COMPRA CAFETERIA PROVIDENCIA", clean: "compra cafeteria providencia", amount: -8000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "pending_review", suggestedBy: "llm", confidence: 0.92, llmLabel: "Cafe y snack" },
  { dayOffset: 30, raw: "COMPRA RESTAURANTE PLAZA", clean: "compra restaurante plaza", amount: -15000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "pending_review", suggestedBy: "llm", confidence: 0.95, llmLabel: "Almuerzo restaurante" },
  { dayOffset: 22, raw: "COMPRA COMIDA RAPIDA", clean: "compra comida rapida", amount: -9000, source: "credit_card_billed", account: 2, category: "Restaurantes", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.88, llmLabel: "Comida rapida" },
  { dayOffset: 15, raw: "COMPRA RESTAURANTE PARQUE", clean: "compra restaurante parque", amount: -22000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "pending_review", suggestedBy: "llm", confidence: 0.93, llmLabel: "Cena restaurante" },
  { dayOffset: 8, raw: "COMPRA SUSHI DELIVERY", clean: "compra sushi delivery", amount: -25000, source: "credit_card_billed", account: 1, category: "Restaurantes", status: "pending_review", suggestedBy: "llm", confidence: 0.89, llmLabel: "Delivery sushi" },
  { dayOffset: 3, raw: "COMPRA RESTAURANTE BARRIO", clean: "compra restaurante barrio", amount: -14000, source: "credit_card_billed", account: 2, category: "Restaurantes", status: "pending_review", suggestedBy: "llm", confidence: 0.94, llmLabel: "Almuerzo restaurante" },

  // --- Gasolina ---
  { dayOffset: 41, raw: "COMPRA ESTACION COMBUSTIBLE NORTE", clean: "compra estacion combustible norte", amount: -25000, source: "account", account: 1, category: "Gasolina", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Carga de combustible" },
  { dayOffset: 33, raw: "COMPRA ESTACION COMBUSTIBLE SUR", clean: "compra estacion combustible sur", amount: -20000, source: "account", account: 1, category: "Gasolina", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Carga de combustible" },
  { dayOffset: 25, raw: "COMPRA ESTACION SERVICIO CENTRO", clean: "compra estacion servicio centro", amount: -30000, source: "account", account: 1, category: "Gasolina", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.91, llmLabel: "Carga de combustible" },
  { dayOffset: 17, raw: "COMPRA ESTACION COMBUSTIBLE ORIENTE", clean: "compra estacion combustible oriente", amount: -22000, source: "account", account: 1, category: "Gasolina", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.90, llmLabel: "Carga de combustible" },
  { dayOffset: 9, raw: "COMPRA ESTACION SERVICIO PONIENTE", clean: "compra estacion servicio poniente", amount: -28000, source: "account", account: 1, category: "Gasolina", status: "pending_review", suggestedBy: "llm", confidence: 0.87, llmLabel: "Carga de combustible" },
  { dayOffset: 2, raw: "COMPRA ESTACION COMBUSTIBLE AUTOPISTA", clean: "compra estacion combustible autopista", amount: -15000, source: "account", account: 1, category: "Gasolina", status: "pending_review", suggestedBy: "llm", confidence: 0.93, llmLabel: "Carga de combustible" },

  // --- Supermercado ---
  { dayOffset: 39, raw: "COMPRA SUPERMERCADO LOCAL", clean: "compra supermercado local", amount: -35000, source: "account", account: 1, category: "Supermercado", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Compra en supermercado" },
  { dayOffset: 27, raw: "COMPRA SUPERMERCADO CENTRO", clean: "compra supermercado centro", amount: -42000, source: "account", account: 1, category: "Supermercado", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.92, llmLabel: "Compra en supermercado" },
  { dayOffset: 18, raw: "COMPRA SUPERMERCADO EXPRESS", clean: "compra supermercado express", amount: -18000, source: "account", account: 2, category: "Supermercado", status: "pending_review", suggestedBy: "llm", confidence: 0.96, llmLabel: "Compra en supermercado" },
  { dayOffset: 6, raw: "COMPRA SUPERMERCADO BARRIO", clean: "compra supermercado barrio", amount: -45000, source: "account", account: 1, category: "Supermercado", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.93, llmLabel: "Compra en supermercado" },

  // --- Transferencia a terceros ---
  { dayOffset: 44, raw: "TRASPASO A PERSONA A", clean: "traspaso a persona a", amount: -50000, source: "account", account: 1, category: "Transferencia a terceros", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Transferencia a tercero" },
  { dayOffset: 42, raw: "TRASPASO A PERSONA B", clean: "traspaso a persona b", amount: -80000, source: "account", account: 1, category: "Transferencia a terceros", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Transferencia a tercero" },
  { dayOffset: 40, raw: "TRASPASO A PERSONA C", clean: "traspaso a persona c", amount: -30000, source: "account", account: 1, category: "Transferencia a terceros", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Transferencia a tercero" },
  { dayOffset: 37, raw: "TRASPASO A PERSONA D", clean: "traspaso a persona d", amount: -120000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.91, llmLabel: "Transferencia a tercero" },
  { dayOffset: 34, raw: "TRASPASO A PERSONA E", clean: "traspaso a persona e", amount: -45000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.89, llmLabel: "Transferencia a tercero" },
  { dayOffset: 31, raw: "TRASPASO A PERSONA F", clean: "traspaso a persona f", amount: -60000, source: "account", account: 2, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.93, llmLabel: "Transferencia a tercero" },
  { dayOffset: 29, raw: "TRASPASO A PERSONA A", clean: "traspaso a persona a", amount: -75000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.95, llmLabel: "Transferencia a tercero" },
  { dayOffset: 26, raw: "TRASPASO A PERSONA G", clean: "traspaso a persona g", amount: -150000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.88, llmLabel: "Transferencia a tercero" },
  { dayOffset: 23, raw: "TRASPASO A PERSONA B", clean: "traspaso a persona b", amount: -40000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.94, llmLabel: "Transferencia a tercero" },
  { dayOffset: 20, raw: "TRASPASO A PERSONA H", clean: "traspaso a persona h", amount: -90000, source: "account", account: 2, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.90, llmLabel: "Transferencia a tercero" },
  { dayOffset: 16, raw: "TRASPASO A PERSONA C", clean: "traspaso a persona c", amount: -55000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.96, llmLabel: "Transferencia a tercero" },
  { dayOffset: 13, raw: "TRASPASO A PERSONA D", clean: "traspaso a persona d", amount: -100000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.87, llmLabel: "Transferencia a tercero" },
  { dayOffset: 11, raw: "TRASPASO A PERSONA I", clean: "traspaso a persona i", amount: -35000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.92, llmLabel: "Transferencia a tercero" },
  { dayOffset: 7, raw: "TRASPASO A PERSONA E", clean: "traspaso a persona e", amount: -70000, source: "account", account: 2, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.93, llmLabel: "Transferencia a tercero" },
  { dayOffset: 4, raw: "TRASPASO A PERSONA J", clean: "traspaso a persona j", amount: -25000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "llm", confidence: 0.86, llmLabel: "Transferencia a tercero" },
  { dayOffset: 1, raw: "TRASPASO A PERSONA A", clean: "traspaso a persona a", amount: -65000, source: "account", account: 1, category: "Transferencia a terceros", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.97, llmLabel: "Transferencia a tercero" },

  // --- Pago entre cuentas ---
  { dayOffset: 36, raw: "TRASPASO ENTRE CUENTAS PROPIAS", clean: "traspaso entre cuentas propias", amount: -200000, source: "account", account: 1, category: "Pago entre cuentas", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Traspaso entre cuentas" },
  { dayOffset: 24, raw: "TRASPASO ENTRE CUENTAS PROPIAS", clean: "traspaso entre cuentas propias", amount: -150000, source: "account", account: 1, category: "Pago entre cuentas", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.97, llmLabel: "Traspaso entre cuentas" },
  { dayOffset: 14, raw: "PAGO TARJETA CREDITO", clean: "pago tarjeta credito", amount: -300000, source: "account", account: 1, category: "Pago entre cuentas", status: "pending_review", suggestedBy: "llm", confidence: 0.94, llmLabel: "Pago tarjeta de credito" },
  { dayOffset: 5, raw: "TRASPASO ENTRE CUENTAS PROPIAS", clean: "traspaso entre cuentas propias", amount: -100000, source: "account", account: 2, category: "Pago entre cuentas", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.96, llmLabel: "Traspaso entre cuentas" },
  { dayOffset: 1, raw: "PAGO TARJETA CREDITO", clean: "pago tarjeta credito", amount: -250000, source: "account", account: 1, category: "Pago entre cuentas", status: "pending_review", suggestedBy: "llm", confidence: 0.93, llmLabel: "Pago tarjeta de credito" },

  // --- Television/Streaming ---
  { dayOffset: 32, raw: "PAGO SERVICIO STREAMING A", clean: "pago servicio streaming a", amount: -7000, source: "credit_card_billed", account: 1, category: "Television/Streaming", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Suscripcion streaming" },
  { dayOffset: 32, raw: "PAGO SERVICIO STREAMING B", clean: "pago servicio streaming b", amount: -5000, source: "credit_card_billed", account: 1, category: "Television/Streaming", status: "pending_review", suggestedBy: "llm", confidence: 0.97, llmLabel: "Suscripcion streaming" },
  { dayOffset: 2, raw: "PAGO SERVICIO STREAMING C", clean: "pago servicio streaming c", amount: -8000, source: "credit_card_billed", account: 1, category: "Television/Streaming", status: "pending_review", suggestedBy: "llm", confidence: 0.96, llmLabel: "Suscripcion streaming" },

  // --- Farmacia ---
  { dayOffset: 37, raw: "COMPRA FARMACIA LOCAL", clean: "compra farmacia local", amount: -8000, source: "credit_card_billed", account: 1, category: "Farmacia", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Compra en farmacia" },
  { dayOffset: 19, raw: "COMPRA FARMACIA CENTRO", clean: "compra farmacia centro", amount: -12000, source: "credit_card_billed", account: 1, category: "Farmacia", status: "pending_review", suggestedBy: "llm", confidence: 0.91, llmLabel: "Compra en farmacia" },
  { dayOffset: 4, raw: "COMPRA FARMACIA BARRIO", clean: "compra farmacia barrio", amount: -5000, source: "credit_card_billed", account: 2, category: "Farmacia", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.89, llmLabel: "Compra en farmacia" },

  // --- Transporte publico ---
  { dayOffset: 41, raw: "CARGA TARJETA TRANSPORTE", clean: "carga tarjeta transporte", amount: -5000, source: "account", account: 1, category: "Transporte publico", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Recarga transporte publico" },
  { dayOffset: 21, raw: "CARGA TARJETA TRANSPORTE", clean: "carga tarjeta transporte", amount: -5000, source: "account", account: 1, category: "Transporte publico", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.98, llmLabel: "Recarga transporte publico" },
  { dayOffset: 3, raw: "CARGA TARJETA TRANSPORTE", clean: "carga tarjeta transporte", amount: -3000, source: "account", account: 1, category: "Transporte publico", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.98, llmLabel: "Recarga transporte publico" },

  // --- Taxi/App ---
  { dayOffset: 29, raw: "PAGO APP TRANSPORTE", clean: "pago app transporte", amount: -6000, source: "credit_card_billed", account: 1, category: "Taxi/App", status: "pending_review", suggestedBy: "llm", confidence: 0.90, llmLabel: "Viaje en app" },
  { dayOffset: 8, raw: "PAGO APP TRANSPORTE", clean: "pago app transporte", amount: -8000, source: "credit_card_billed", account: 1, category: "Taxi/App", status: "pending_review", suggestedBy: "llm", confidence: 0.91, llmLabel: "Viaje en app" },

  // --- Deporte/Gym ---
  { dayOffset: 35, raw: "PAGO GIMNASIO MENSUAL", clean: "pago gimnasio mensual", amount: -25000, source: "credit_card_billed", account: 1, category: "Deporte/Gym", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Mensualidad gimnasio" },
  { dayOffset: 5, raw: "PAGO GIMNASIO MENSUAL", clean: "pago gimnasio mensual", amount: -25000, source: "credit_card_billed", account: 1, category: "Deporte/Gym", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.99, llmLabel: "Mensualidad gimnasio" },

  // --- Electricidad ---
  { dayOffset: 30, raw: "PAGO CUENTA LUZ", clean: "pago cuenta luz", amount: -18000, source: "account", account: 1, category: "Electricidad", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Pago cuenta de luz" },
  { dayOffset: 1, raw: "PAGO CUENTA LUZ", clean: "pago cuenta luz", amount: -20000, source: "account", account: 1, category: "Electricidad", status: "pending_review", suggestedBy: "fuzzy", confidence: 0.97, llmLabel: "Pago cuenta de luz" },

  // --- Internet ---
  { dayOffset: 30, raw: "PAGO INTERNET HOGAR", clean: "pago internet hogar", amount: -22000, source: "account", account: 1, category: "Internet", status: "confirmed", suggestedBy: "human", confidence: null, llmLabel: "Pago internet mensual" },

  // --- Gastos comunes ---
  { dayOffset: 10, raw: "PAG GASTOS COMUNES EDIFICIO", clean: "pag gastos comunes edificio", amount: -45000, source: "account", account: 1, category: "Gastos comunes", status: "pending_review", suggestedBy: "llm", confidence: 0.88, llmLabel: "Gastos comunes edificio" },

  // --- Credit card unbilled ---
  { dayOffset: 6, raw: "COMPRA TIENDA ONLINE", clean: "compra tienda online", amount: -15000, source: "credit_card_unbilled", account: 1, category: "Electronica", status: "pending_review", suggestedBy: "llm", confidence: 0.82, llmLabel: "Compra electronica online" },
  { dayOffset: 3, raw: "COMPRA ROPA TIENDA", clean: "compra ropa tienda", amount: -28000, source: "credit_card_unbilled", account: 1, category: "Ropa", status: "pending_review", suggestedBy: "llm", confidence: 0.85, llmLabel: "Compra de ropa" },
  { dayOffset: 1, raw: "COMPRA REGALO TIENDA", clean: "compra regalo tienda", amount: -20000, source: "credit_card_unbilled", account: 2, category: "Regalos", status: "pending_review", suggestedBy: "llm", confidence: 0.83, llmLabel: "Compra de regalo" },

  // --- Uncategorized ---
  { dayOffset: 44, raw: "CARGO DESCONOCIDO A", clean: "cargo desconocido a", amount: -3000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 40, raw: "COMPRA COMERCIO VARIOS", clean: "compra comercio varios", amount: -7000, source: "credit_card_billed", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 36, raw: "PAGO SERVICIO EXTERNO", clean: "pago servicio externo", amount: -11000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 33, raw: "CARGO AUTOMATICO MENSUAL", clean: "cargo automatico mensual", amount: -4000, source: "credit_card_billed", account: 2, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 29, raw: "COMPRA TIENDA BARRIO", clean: "compra tienda barrio", amount: -9000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 25, raw: "PAGO SERVICIO DIGITAL", clean: "pago servicio digital", amount: -6000, source: "credit_card_billed", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 21, raw: "CARGO DESCONOCIDO B", clean: "cargo desconocido b", amount: -2000, source: "account", account: 2, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 17, raw: "COMPRA COMERCIO ONLINE", clean: "compra comercio online", amount: -14000, source: "credit_card_billed", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 13, raw: "PAGO PENDIENTE CUENTA", clean: "pago pendiente cuenta", amount: -8000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 9, raw: "COMPRA TIENDA CENTRO", clean: "compra tienda centro", amount: -16000, source: "credit_card_billed", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 6, raw: "CARGO SERVICIO SUSCRIPCION", clean: "cargo servicio suscripcion", amount: -5000, source: "credit_card_billed", account: 2, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 3, raw: "COMPRA COMERCIO LOCAL", clean: "compra comercio local", amount: -10000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 1, raw: "PAGO APP DESCONOCIDA", clean: "pago app desconocida", amount: -3000, source: "credit_card_billed", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 0, raw: "CARGO PENDIENTE", clean: "cargo pendiente", amount: -7000, source: "account", account: 1, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
  { dayOffset: 0, raw: "COMPRA VARIOS", clean: "compra varios", amount: -12000, source: "credit_card_billed", account: 2, category: null, status: "uncategorized", suggestedBy: null, confidence: null, llmLabel: null },
];

// ---------------------------------------------------------------------------
// Seeder
// ---------------------------------------------------------------------------

export function seedMockData(db: Db): { imported: number; categorized: number } {
  // 1. Insert accounts
  const acc1 = db.insert(accounts).values({ bankId: "banco-chile", name: "Cuenta Corriente" }).returning().get();
  const acc2 = db.insert(accounts).values({ bankId: "banco-estado", name: "Cuenta Vista" }).returning().get();
  const accIds = { 1: acc1.id, 2: acc2.id } as const;

  // 2. Build category lookup
  const allCats = db.select().from(categories).all();
  const catMap = new Map(allCats.map((c) => [c.name, c.id]));

  // 3. Insert transactions
  let imported = 0;
  let categorized = 0;

  for (let i = 0; i < MOCK_TXNS.length; i++) {
    const txn = MOCK_TXNS[i];
    const date = fmt(daysAgo(txn.dayOffset));
    // Include index in hash to guarantee uniqueness
    const hash = generateHash(accIds[txn.account], date, `${txn.raw}|${i}`, txn.amount);
    const categoryId = txn.category ? catMap.get(txn.category) ?? null : null;

    db.insert(transactions)
      .values({
        accountId: accIds[txn.account],
        hash,
        date,
        rawDescription: txn.raw,
        cleanDescription: txn.clean,
        amount: txn.amount,
        balance: txn.balance ?? null,
        source: txn.source,
        categoryId,
        suggestedBy: txn.suggestedBy,
        confidence: txn.confidence,
        status: txn.status,
        llmLabel: txn.llmLabel,
      })
      .run();

    imported++;
    if (txn.status !== "uncategorized") categorized++;
  }

  // 4. Insert categorization history for confirmed transactions
  const confirmed = db
    .select()
    .from(transactions)
    .where(eq(transactions.status, "confirmed"))
    .all();

  for (const txn of confirmed) {
    if (txn.categoryId) {
      db.insert(categorizationHistory)
        .values({
          transactionId: txn.id,
          oldCategoryId: null,
          newCategoryId: txn.categoryId,
          changedBy: "human",
        })
        .run();
    }
  }

  return { imported, categorized };
}
