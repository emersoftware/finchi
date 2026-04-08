import React from "react";
import { Box, Text } from "ink";
import type { FilterState, TransactionRow } from "./queries.js";
import { formatCLP, truncate } from "./format.js";
import { FilterSummaryBar } from "./components/filter-bar.js";

export type SortColumn = "date" | "description" | "amount" | "category" | "account";
export type SortDirection = "asc" | "desc" | null;
export type FocusZone = "search" | "header" | "rows";

export const TRANSACTION_HEADERS: Array<{ key: SortColumn; label: string; width?: number; flexGrow?: number }> = [
  { key: "date", label: "Fecha", width: 11 },
  { key: "description", label: "Descripcion", flexGrow: 1 },
  { key: "amount", label: "Monto", width: 13 },
  { key: "category", label: "Categoria", width: 20 },
  { key: "account", label: "Banco", width: 16 },
];

interface TransactionsViewProps {
  rows: TransactionRow[];
  totalResults: number;
  page: number;
  totalPages: number;
  focusZone: FocusZone;
  selectedRow: number;
  headerIndex: number;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  searchBuffer: string;
  filters: FilterState;
  categories: Array<{ id: number; name: string }>;
  accounts: Array<{ id: number; name: string }>;
  statusMsg: string | null;
  panelFocused: boolean;
}

export function TransactionsView({
  rows,
  totalResults,
  page,
  totalPages,
  focusZone,
  selectedRow,
  headerIndex,
  sortColumn,
  sortDirection,
  searchBuffer,
  filters,
  categories,
  accounts,
  statusMsg,
  panelFocused,
}: TransactionsViewProps) {
  const getDescription = (row: TransactionRow) =>
    (row.llmLabel || row.rawDescription).replace(/\s+/g, " ").trim();
  const getCategoryDisplay = (row: TransactionRow) => row.categoryName || "Sin categoria";
  const searchFocused = panelFocused && focusZone === "search";

  return (
    <Box flexDirection="column">
      {/* ── Search bar ── */}
      <Box borderStyle="round" borderColor={searchFocused ? "cyan" : "gray"} paddingX={1}>
        {searchFocused ? (
          <>
            <Text color="green">{searchBuffer}</Text>
            <Text color="green">▌</Text>
            {!searchBuffer && <Text dimColor>Buscar...</Text>}
          </>
        ) : (
          <Text dimColor>{searchBuffer || "Buscar..."}</Text>
        )}
      </Box>

      <FilterSummaryBar filters={filters} categories={categories} accounts={accounts} />

      <Box justifyContent="space-between" marginTop={1}>
        <Text dimColor>
          {totalResults} resultados
        </Text>
        <Text dimColor>
          Pag {page}/{totalPages}
        </Text>
      </Box>

      {/* ── Table header ── */}
      <Box>
        {TRANSACTION_HEADERS.map((header, idx) => {
          const isFocused = panelFocused && focusZone === "header" && headerIndex === idx;
          const indicator =
            sortColumn === header.key
              ? sortDirection === "asc" ? " ▲" : sortDirection === "desc" ? " ▼" : ""
              : "";
          return (
            <Box key={header.key} width={header.width} flexGrow={header.flexGrow} flexShrink={header.flexGrow ? 1 : 0} flexBasis={header.flexGrow ? 0 : undefined}>
              <Text bold inverse={isFocused} color={isFocused ? "cyan" : undefined}>
                {`${header.label}${indicator}`}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* ── Header separator ── */}
      <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} />

      {/* ── Rows ── */}
      {rows.length === 0 ? (
        <Box paddingY={1}>
          <Text dimColor>No se encontraron transacciones.</Text>
        </Box>
      ) : (
        rows.map((row, idx) => {
          const isSelected = panelFocused && focusZone === "rows" && idx === selectedRow;
          return (
            <Box key={row.id}>
              <Box width={11}>
                <Text inverse={isSelected}>{truncate(row.date, 10)}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} flexBasis={0} overflowX="hidden">
                <Text inverse={isSelected} wrap="truncate-end">{getDescription(row)}</Text>
              </Box>
              <Box width={13}>
                <Text inverse={isSelected} color={row.amount < 0 ? "red" : "green"}>
                  {truncate(formatCLP(row.amount), 12)}
                </Text>
              </Box>
              <Box width={20}>
                <Text inverse={isSelected}>{truncate(getCategoryDisplay(row), 19)}</Text>
              </Box>
              <Box width={16}>
                <Text inverse={isSelected}>{truncate(row.accountName, 15)}</Text>
              </Box>
            </Box>
            );
          })
        )}

      {/* ── Status ── */}
      {statusMsg && <Text color="green">{statusMsg}</Text>}

      {/* ── Bottom shortcuts ── */}
      <Text dimColor>
        / buscar │ f filtros globales │ ←→ paginar o filtrar resumen │ ↑↓ navegar │ Enter ordenar │ e editar │ Tab panel │ q salir
      </Text>
    </Box>
  );
}
