import React from "react";
import { Box, Text } from "ink";
import { CategorySelect, type CategoryItem } from "./category-select.js";

export type ActionPanelMode =
  | { kind: "idle"; statusMsg?: string | null }
  | { kind: "edit"; categories: CategoryItem[]; onSelect: (id: number) => void; onCancel: () => void };

interface ActionPanelProps {
  mode: ActionPanelMode;
}

export function ActionPanel({ mode }: ActionPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" flexGrow={1} paddingX={1}>
      {mode.kind === "idle" && (
        <Box flexDirection="column">
          {mode.statusMsg && (
            <Box marginBottom={1}>
              <Text color="green">{mode.statusMsg}</Text>
            </Box>
          )}
          <Text bold color="yellow">Atajos de teclado</Text>
          <Text dimColor>/  buscar transacciones</Text>
          <Text dimColor>f  abrir filtros</Text>
          <Text dimColor>e  editar categoria</Text>
          <Text dimColor>↑↓ navegar filas</Text>
          <Text dimColor>←→ cambiar pagina</Text>
          <Text dimColor>q  salir</Text>
        </Box>
      )}
      {mode.kind === "edit" && (
        <CategorySelect
          categories={mode.categories}
          onSelect={mode.onSelect}
          onCancel={mode.onCancel}
        />
      )}
    </Box>
  );
}
