import React from "react";
import { Box, Text } from "ink";
import { formatCLP, truncate } from "../format.js";

export interface BarChartItem {
  label: string;
  value: number;
  percentage: number;
}

interface BarChartProps {
  title: string;
  items: BarChartItem[];
  availableWidth?: number;
  height?: number;
  scrollOffset?: number;
}

// Gradient colors from cool to warm (green → yellow → red)
const BAR_COLORS = ["green", "green", "greenBright", "yellow", "yellowBright", "red", "redBright"] as const;

function getBarColor(percentage: number): string {
  const idx = Math.min(Math.floor((percentage / 100) * BAR_COLORS.length), BAR_COLORS.length - 1);
  return BAR_COLORS[idx];
}

/**
 * Render a horizontal bar using Unicode block characters.
 * Uses ████ for filled and ░ for empty.
 * Supports fractional fills with partial block chars: ▏▎▍▌▋▊▉█
 */
function renderFancyBar(percentage: number, width: number): { filled: string; empty: string } {
  const FULL = "█";
  const EMPTY = "░";
  const PARTIALS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉"];

  const totalFill = (percentage / 100) * width;
  const fullBlocks = Math.floor(totalFill);
  const remainder = totalFill - fullBlocks;

  let filled = FULL.repeat(fullBlocks);

  if (remainder > 0 && fullBlocks < width) {
    const partialIdx = Math.min(Math.floor(remainder * 8), 7);
    if (partialIdx > 0) {
      filled += PARTIALS[partialIdx - 1];
    } else {
      filled += EMPTY;
    }
    const emptyCount = width - fullBlocks - 1;
    return { filled, empty: EMPTY.repeat(Math.max(0, emptyCount)) };
  }

  const emptyCount = width - fullBlocks;
  return { filled, empty: EMPTY.repeat(Math.max(0, emptyCount)) };
}

export function BarChart({
  title,
  items,
  availableWidth = 60,
  height = 8,
  scrollOffset = 0,
}: BarChartProps) {
  const bodyHeight = Math.max(2, height - 1);
  const maxOffset = Math.max(0, items.length - bodyHeight);
  const safeOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const visible = items.slice(safeOffset, safeOffset + bodyHeight);

  // Compute dynamic widths based on available space
  // Layout: [label] [bar] [pct] [value]
  // pct = 5 chars ("100% "), value = max CLP formatted length + 1
  const widthSource = items.length > 0 ? items : visible;
  const maxValueLen = widthSource.reduce((max, item) => {
    const len = formatCLP(item.value).length;
    return len > max ? len : max;
  }, 8);
  const pctWidth = 5; // " 99% "
  const valueWidth = maxValueLen + 1;
  const labelWidth = Math.min(16, Math.max(10, Math.floor(availableWidth * 0.25)));
  const barWidth = Math.max(8, availableWidth - labelWidth - pctWidth - valueWidth - 1);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Text bold color="yellow">{title}</Text>
      {visible.length === 0 ? (
        <>
          <Text dimColor>Sin datos</Text>
          {Array.from({ length: Math.max(0, bodyHeight - 1) }, (_, index) => (
            <Text key={`empty-${index}`}> </Text>
          ))}
        </>
      ) : (
        <>
          {visible.map((item, index) => {
            const { filled, empty } = renderFancyBar(item.percentage, barWidth);
            const color = getBarColor(item.percentage);
            const pct = `${Math.round(item.percentage)}%`.padStart(4);

            return (
              <Box key={`${item.label}-${safeOffset + index}`} width={availableWidth}>
                <Box width={labelWidth} flexShrink={0}>
                  <Text>{truncate(item.label, labelWidth - 1)}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={color}>{filled}</Text>
                  <Text dimColor>{empty}</Text>
                </Box>
                <Box flexShrink={0}>
                  <Text dimColor> {pct} </Text>
                  <Text color="red">{formatCLP(item.value)}</Text>
                </Box>
              </Box>
            );
          })}
          {Array.from({ length: Math.max(0, bodyHeight - visible.length) }, (_, index) => (
            <Text key={`pad-${index}`}> </Text>
          ))}
        </>
      )}
    </Box>
  );
}
