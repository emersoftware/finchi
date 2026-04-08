import React from "react";
import { Box, Text } from "ink";
import type { FilterState } from "../queries.js";

export const SOURCE_LABELS: Record<string, string> = {
  account: "Cuenta",
  credit_card_billed: "Tarjeta facturada",
  credit_card_unbilled: "Tarjeta por facturar",
};

const AMOUNT_TYPE_LABELS: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function truncateChip(value: string, max = 22) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.from) count += 1;
  if (filters.to) count += 1;
  if (filters.groupNames?.length) count += 1;
  else if (filters.groupName) count += 1;
  if (filters.categoryIds?.length) count += 1;
  else if (filters.categoryId !== undefined) count += 1;
  if (filters.accountIds?.length) count += 1;
  else if (filters.accountId !== undefined) count += 1;
  if (filters.amountTypes?.length) count += 1;
  else if (filters.type) count += 1;
  if (filters.sources?.length) count += 1;
  else if (filters.source) count += 1;
  if (filters.search) count += 1;
  return count;
}

export function getFilterChips(
  filters: FilterState,
  categories: Array<{ id: number; name: string }>,
  accounts: Array<{ id: number; name: string }>,
): string[] {
  const chips: string[] = [];
  const groupNames = filters.groupNames?.length ? filters.groupNames : filters.groupName ? [filters.groupName] : [];
  const categoryIds = filters.categoryIds?.length ? filters.categoryIds : filters.categoryId !== undefined ? [filters.categoryId] : [];
  const accountIds = filters.accountIds?.length ? filters.accountIds : filters.accountId !== undefined ? [filters.accountId] : [];
  const amountTypes = filters.amountTypes?.length ? filters.amountTypes : filters.type ? [filters.type] : [];
  const sources = filters.sources?.length ? filters.sources : filters.source ? [filters.source] : [];

  if (filters.from || filters.to) {
    chips.push(`Fecha ${filters.from || "..."} -> ${filters.to || "..."}`);
  }

  if (groupNames.length) {
    const label = groupNames.length === 1 ? groupNames[0] : `${groupNames.length} grupos`;
    chips.push(`Grupo ${truncateChip(label)}`);
  }

  if (categoryIds.length) {
    const names = unique(
      categoryIds
        .map((id) => categories.find((category) => category.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    );
    if (names.length === 1) chips.push(`Categoria ${truncateChip(names[0])}`);
    else if (names.length > 1) chips.push(`Categorias ${names.length}`);
  }

  if (accountIds.length) {
    const names = unique(
      accountIds
        .map((id) => accounts.find((account) => account.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    );
    if (names.length === 1) chips.push(`Banco ${truncateChip(names[0])}`);
    else if (names.length > 1) chips.push(`Bancos ${names.length}`);
  }

  if (amountTypes.length) {
    const labels = amountTypes.map((type) => AMOUNT_TYPE_LABELS[type]);
    chips.push(labels.length === 1 ? labels[0] : "Ingresos + egresos");
  }

  if (sources.length) {
    const labels = sources.map((source) => SOURCE_LABELS[source] || source);
    chips.push(labels.length === 1 ? `Tipo ${truncateChip(labels[0])}` : `Tipos ${labels.length}`);
  }

  if (filters.search) {
    chips.push(`Buscar "${truncateChip(filters.search, 16)}"`);
  }

  return chips;
}

interface FilterSummaryBarProps {
  filters: FilterState;
  categories: Array<{ id: number; name: string }>;
  accounts: Array<{ id: number; name: string }>;
}

export function FilterSummaryBar({ filters, categories, accounts }: FilterSummaryBarProps) {
  const chips = getFilterChips(filters, categories, accounts);
  const activeCount = countActiveFilters(filters);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box justifyContent="space-between">
        <Text bold color={activeCount > 0 ? "cyan" : "gray"}>
          Filtros {activeCount > 0 ? `(${activeCount})` : ""}
        </Text>
        <Text dimColor>f abrir modal</Text>
      </Box>

      <Box flexWrap="wrap" gap={1}>
        {chips.length === 0 ? (
          <Text dimColor>Sin filtros activos</Text>
        ) : (
          chips.map((chip) => (
            <Text key={chip} color="black" backgroundColor="cyan">
              {" "}
              {chip}
              {" "}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
