import type { Flags } from "./cli-flags";
import { getCurrentMonthRange, getMonthRange } from "./tui/format";

export interface DateWindow {
  from?: string;
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function assertIsoDate(value: string, field: string): void {
  if (!DATE_RE.test(value)) {
    throw new Error(`${field} debe tener formato YYYY-MM-DD.`);
  }
}

export function assertIsoMonth(value: string): void {
  if (!MONTH_RE.test(value)) {
    throw new Error("month debe tener formato YYYY-MM.");
  }
}

export function resolveMonthWindow(month: string): DateWindow {
  assertIsoMonth(month);
  const [yearText, monthText] = month.split("-");
  return getMonthRange(Number(yearText), Number(monthText));
}

export function resolvePresetWindow(months: number): DateWindow {
  const now = new Date();
  const end = now.getFullYear() * 12 + now.getMonth();
  const start = end - (months - 1);
  const startYear = Math.floor(start / 12);
  const startMonth = (start % 12) + 1;
  const from = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const current = getCurrentMonthRange();
  return { from, to: current.to };
}

export function resolveDateWindow(flags: Flags): DateWindow {
  if (typeof flags["month"] === "string") {
    return resolveMonthWindow(flags["month"]);
  }

  for (const months of [1, 3, 6, 12]) {
    if (flags[`${months}m`] === true) {
      return resolvePresetWindow(months);
    }
  }

  const from = typeof flags["from"] === "string" ? flags["from"] : undefined;
  const to = typeof flags["to"] === "string" ? flags["to"] : undefined;

  if (from) assertIsoDate(from, "from");
  if (to) assertIsoDate(to, "to");

  return { from, to };
}
