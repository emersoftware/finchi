/** Format an integer amount as Chilean pesos: -50000 -> "-$50.000", 100000 -> "$100.000" */
export function formatCLP(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.round(Math.abs(amount));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${formatted}`;
}

/** Render an ASCII bar proportional to the given percentage (0-100). */
export function renderBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${Math.round(percentage)}%`;
}

/** Get the first and last day of a given month in YYYY-MM-DD format. */
export function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return getMonthRange(now.getFullYear(), now.getMonth() + 1);
}

export function truncate(text: string, maxLen: number): string {
  if (text.length > maxLen) return text.slice(0, maxLen - 1) + "…";
  return text;
}

export function paginate(totalItems: number, pageSize: number, currentPage: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  return { totalPages, currentPage: safePage, startIndex, endIndex };
}

export interface GroupSummary {
  groupName: string;
  total: number;
  percentage: number;
}

const SUMMARY_EXCLUDED_CATEGORY_NAMES = new Set([
  "Pago entre cuentas",
  "Traspaso entre cuentas",
  "Pago tarjeta de credito",
  "Pago de tarjeta de credito",
]);

function shouldExcludeFromSummary(row: {
  excludeFromSummary?: boolean;
  categoryName?: string | null;
}): boolean {
  if (row.excludeFromSummary) return true;
  if (!row.categoryName) return false;
  return SUMMARY_EXCLUDED_CATEGORY_NAMES.has(row.categoryName);
}

export function aggregateByGroup(
  rows: Array<{
    amount: number;
    categoryGroup: string | null;
    categoryName?: string | null;
    excludeFromSummary?: boolean;
  }>
): { groups: GroupSummary[]; totalExpenses: number; totalIncome: number } {
  const groupMap = new Map<string, number>();
  let totalExpenses = 0;
  let totalIncome = 0;

  for (const row of rows) {
    if (shouldExcludeFromSummary(row)) continue;

    if (row.amount < 0) {
      totalExpenses += row.amount;
      const key = row.categoryGroup || "Sin grupo";
      groupMap.set(key, (groupMap.get(key) || 0) + row.amount);
    } else {
      totalIncome += row.amount;
    }
  }

  const groups: GroupSummary[] = Array.from(groupMap.entries())
    .map(([groupName, total]) => ({
      groupName,
      total,
      percentage: totalExpenses !== 0 ? (total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => a.total - b.total);

  return { groups, totalExpenses, totalIncome };
}

export interface CategorySummary {
  categoryId: number | null;
  categoryName: string;
  emoji: string;
  total: number;
  percentage: number;
}

export function aggregateByCategory(
  rows: Array<{
    amount: number;
    categoryId: number | null;
    categoryName: string | null;
    emoji: string | null;
    excludeFromSummary?: boolean;
  }>
): { expenses: CategorySummary[]; totalExpenses: number; totalIncome: number } {
  const expenseMap = new Map<number | null, { name: string; emoji: string; total: number }>();
  let totalExpenses = 0;
  let totalIncome = 0;

  for (const row of rows) {
    if (shouldExcludeFromSummary(row)) continue;

    if (row.amount < 0) {
      totalExpenses += row.amount;
      const key = row.categoryId;
      const existing = expenseMap.get(key);
      if (existing) {
        existing.total += row.amount;
      } else {
        expenseMap.set(key, {
          name: row.categoryName || "Sin categoria",
          emoji: row.emoji || "",
          total: row.amount,
        });
      }
    } else {
      totalIncome += row.amount;
    }
  }

  const expenses: CategorySummary[] = Array.from(expenseMap.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.name,
      emoji: data.emoji,
      total: data.total,
      percentage: totalExpenses !== 0 ? (data.total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => a.total - b.total);

  return { expenses, totalExpenses, totalIncome };
}
