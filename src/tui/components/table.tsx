import React from "react";
import { Box, Text } from "ink";
import { truncate } from "../format";

export interface Column {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right";
}

export interface TableProps {
  columns: Column[];
  data: Array<Record<string, string>>;
  selectedRow: number;
  pageSize?: number;
}

/** Calculate which page a selected row falls on and the visible slice. */
export function paginateRows(
  totalRows: number,
  selectedRow: number,
  pageSize: number,
): { start: number; end: number; page: number; totalPages: number } {
  if (totalRows === 0) return { start: 0, end: 0, page: 0, totalPages: 0 };
  const totalPages = Math.ceil(totalRows / pageSize);
  const page = Math.floor(selectedRow / pageSize);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, totalRows);
  return { start, end, page: page + 1, totalPages };
}

function pad(text: string, width: number, align: "left" | "right"): string {
  const truncated = truncate(text, width);
  const spaces = Math.max(0, width - truncated.length);
  return align === "right"
    ? " ".repeat(spaces) + truncated
    : truncated + " ".repeat(spaces);
}

export function Table({ columns, data, selectedRow, pageSize = 15 }: TableProps) {
  const { start, end, page, totalPages } = paginateRows(data.length, selectedRow, pageSize);
  const visibleData = data.slice(start, end);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col, i) => (
          <Box key={col.key} width={col.width} marginRight={i < columns.length - 1 ? 1 : 0}>
            <Text bold>{pad(col.label, col.width || col.label.length, col.align || "left")}</Text>
          </Box>
        ))}
      </Box>
      {/* Separator */}
      <Box>
        <Text dimColor>
          {columns.map((col) => "\u2501".repeat(col.width || col.label.length)).join("\u2501")}
        </Text>
      </Box>
      {/* Rows */}
      {visibleData.map((row, i) => {
        const absoluteIndex = start + i;
        const isSelected = absoluteIndex === selectedRow;
        return (
          <Box key={absoluteIndex}>
            {columns.map((col, ci) => (
              <Box key={col.key} width={col.width} marginRight={ci < columns.length - 1 ? 1 : 0}>
                <Text inverse={isSelected}>
                  {pad(row[col.key] || "", col.width || col.label.length, col.align || "left")}
                </Text>
              </Box>
            ))}
          </Box>
        );
      })}
      {/* Pagination */}
      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Pagina {page}/{totalPages}
          </Text>
        </Box>
      )}
    </Box>
  );
}
