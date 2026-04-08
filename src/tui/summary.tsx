import React from "react";
import { Box, Text } from "ink";
import { BarChart, type BarChartItem } from "./components/bar-chart.js";
import { type GroupSummary, type CategorySummary } from "./format.js";

interface RightPanelProps {
  focused: boolean;
  groupExpenses: GroupSummary[];
  categoryExpenses: CategorySummary[];
  groups: string[];
  selectedGroup: string | undefined;
  selectedGroupLabel: string;
  availableWidth: number;
  availableHeight: number;
  groupScrollOffset: number;
  categoryScrollOffset: number;
}

function SectionDivider({ width }: { width: number }) {
  return <Text dimColor>{"─".repeat(Math.max(1, width))}</Text>;
}

export function getRightPanelChartHeights(availableHeight: number, showFooter: boolean) {
  const fixedLines = 3 + (showFooter ? 1 : 0);
  const chartAreaHeight = Math.max(6, availableHeight - fixedLines);
  const topChartHeight = Math.max(3, Math.ceil(chartAreaHeight / 2));
  const bottomChartHeight = Math.max(3, chartAreaHeight - topChartHeight);

  return { topChartHeight, bottomChartHeight };
}

export function RightPanel({
  focused,
  groupExpenses,
  categoryExpenses,
  groups,
  selectedGroup,
  selectedGroupLabel,
  availableWidth,
  availableHeight,
  groupScrollOffset,
  categoryScrollOffset,
}: RightPanelProps) {
  const groupItems: BarChartItem[] = groupExpenses.map((g) => ({
    label: g.groupName,
    value: g.total,
    percentage: g.percentage,
  }));

  const categoryItems: BarChartItem[] = categoryExpenses.map((c) => ({
    label: `${c.emoji} ${c.categoryName}`.trim(),
    value: c.total,
    percentage: c.percentage,
  }));

  const showFooter = !focused && groups.length > 0;
  const { topChartHeight, bottomChartHeight } = getRightPanelChartHeights(availableHeight, showFooter);

  return (
    <Box flexDirection="column" paddingLeft={1} width="100%" height={availableHeight} overflow="hidden">
      {/* Group filter */}
      <Box>
        <Text dimColor={!focused} bold={focused} color={focused ? "cyan" : undefined}>
          Grupo:{" "}
        </Text>
        {focused && <Text color="yellow">◀ </Text>}
        <Text bold={focused} color={focused ? "green" : undefined}>
          {selectedGroupLabel}
        </Text>
        {focused && <Text color="yellow"> ▶</Text>}
        {focused && <Text dimColor>  ←→ filtrar │ ↑↓ scroll │ Tab: volver</Text>}
      </Box>

      <SectionDivider width={availableWidth} />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <BarChart
          title="Gastos por grupo"
          items={groupItems}
          availableWidth={availableWidth}
          height={topChartHeight}
          scrollOffset={groupScrollOffset}
        />

        <SectionDivider width={availableWidth} />

        <BarChart
          title={selectedGroup ? `Categorias: ${selectedGroup}` : "Gastos por categoria"}
          items={categoryItems}
          availableWidth={availableWidth}
          height={bottomChartHeight}
          scrollOffset={categoryScrollOffset}
        />
      </Box>

      {showFooter && (
        <Text dimColor>Tab al resumen para filtrar por grupo</Text>
      )}
    </Box>
  );
}
