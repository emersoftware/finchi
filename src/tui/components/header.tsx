import React from "react";
import { Box, Text } from "ink";
import { formatCLP } from "../format.js";
import { LOGO_LINES } from "../logo.js";

export const FULL_HEADER_HEIGHT = LOGO_LINES.length + 1;
export const COMPACT_HEADER_HEIGHT = 3;

export function getHeaderHeight(compact: boolean) {
  return compact ? COMPACT_HEADER_HEIGHT : FULL_HEADER_HEIGHT;
}

interface HeaderProps {
  config: { llmModel: string };
  accounts: Array<{ id: number; name: string }>;
  totalIncome: number;
  totalExpenses: number;
  transactionCount: number;
  compact?: boolean;
}

export function Header({ config, accounts, totalIncome, totalExpenses, transactionCount, compact = false }: HeaderProps) {
  const balance = totalIncome + totalExpenses;
  const accountsLabel = accounts.length > 0 ? accounts.map((a) => a.name).join(", ") : "Sin cuentas";

  if (compact) {
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Box>
            <Text bold color="yellow">finchi</Text>
            <Text dimColor>  {config.llmModel}</Text>
          </Box>

          <Box gap={1}>
            <Text bold color="green">{formatCLP(totalIncome)}</Text>
            <Text bold color="red">{formatCLP(totalExpenses)}</Text>
            <Text bold color={balance >= 0 ? "green" : "red"}>{formatCLP(balance)}</Text>
            <Text dimColor>{transactionCount} txns</Text>
          </Box>
        </Box>

        <Text dimColor wrap="truncate-end">Cuentas: {accountsLabel}</Text>

        <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {/* Logo */}
        <Box flexDirection="column" width={36}>
          {(LOGO_LINES as string[]).map((line: string, i: number) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>

        {/* Model & Accounts */}
        <Box flexDirection="column" justifyContent="center" marginLeft={1}>
          <Box gap={1}>
            <Text dimColor>Modelo:</Text>
            <Text bold color="cyan">{config.llmModel}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Cuentas:</Text>
            <Text>{accountsLabel}</Text>
          </Box>
        </Box>

        {/* Income / Expenses — centered left, stacked */}
        <Box flexGrow={1} />
        <Box flexDirection="column" justifyContent="center">
          <Box gap={1}>
            <Text dimColor>Ingresos:</Text>
            <Text bold color="green">{formatCLP(totalIncome)}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Gastos:</Text>
            <Text bold color="red">{formatCLP(totalExpenses)}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Balance:</Text>
            <Text bold color={balance >= 0 ? "green" : "red"}>{formatCLP(balance)}</Text>
            <Text dimColor>  {transactionCount} txns</Text>
          </Box>
        </Box>
        <Box flexGrow={1} />
      </Box>

      {/* Separator */}
      <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} />
    </Box>
  );
}
