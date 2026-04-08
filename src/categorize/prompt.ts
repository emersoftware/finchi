interface TransactionInput {
  id: number;
  description: string;
  amount: number;
}

interface ExampleInput {
  description: string;
  amount: number;
  category: string;
}

interface CategoryWithGroup {
  name: string;
  group: string;
}

/** Build the system prompt for LLM classification. */
export function buildSystemPrompt(cats: CategoryWithGroup[]): string {
  // Group categories by group name
  const groups = new Map<string, string[]>();
  for (const cat of cats) {
    const g = cat.group || "Otros";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(cat.name);
  }

  const categoryList = Array.from(groups.entries())
    .map(([group, names]) => `${group}:\n${names.map((n) => `  - ${n}`).join("\n")}`)
    .join("\n");

  return `Eres un categorizador de transacciones bancarias chilenas. Tu tarea es clasificar cada transacción en exactamente una de las siguientes categorías:

${categoryList}

Responde SOLAMENTE con un array JSON válido con el siguiente formato para cada transacción:
[{"transaction_id": <number>, "category": "<nombre exacto de categoría>", "confidence": <0.0-1.0>, "label": "<etiqueta corta descriptiva>"}]

Reglas:
- "category" debe ser exactamente uno de los nombres listados arriba
- "confidence" es tu nivel de certeza de 0.0 a 1.0
- "label" es una etiqueta corta en español que describe la transacción (ej: "Compra en Lider", "Pago Netflix")
- Montos negativos son gastos, positivos son ingresos
- Usa "Pago entre cuentas" para movimientos internos entre productos del mismo titular: pagos de tarjeta de credito (ej: "Cargo Por Pago Tc", "Pago Tarjeta De Credito"), transferencias desde/hacia linea de credito, traspasos entre cuentas propias
- Usa "Transferencia a terceros" para transferencias a otras personas (ej: "Traspaso A:Carolina Rubilar", "Pago:mercadopago")
- No incluyas texto fuera del JSON`;
}

/** Build the user prompt with few-shot examples and the batch of transactions to classify. */
export function buildUserPrompt(
  transactionsToClassify: TransactionInput[],
  examples: ExampleInput[],
): string {
  const parts: string[] = [];

  if (examples.length > 0) {
    parts.push("Ejemplos de transacciones ya clasificadas:");
    for (const ex of examples) {
      const formattedAmount = formatCLP(ex.amount);
      parts.push(`- "${ex.description}" (${formattedAmount}) -> ${ex.category}`);
    }
    parts.push("");
  }

  parts.push("Clasifica las siguientes transacciones:");
  parts.push("");

  for (const tx of transactionsToClassify) {
    const formattedAmount = formatCLP(tx.amount);
    parts.push(`- ID ${tx.id}: "${tx.description}" (${formattedAmount})`);
  }

  return parts.join("\n");
}

function formatCLP(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  const abs = Math.abs(amount).toLocaleString("es-CL");
  return `${sign}$${abs}`;
}
