import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";

export interface CategoryItem {
  id: number;
  name: string;
  group: string;
}

export interface CategorySelectProps {
  categories: CategoryItem[];
  onSelect: (categoryId: number) => void;
  onCancel: () => void;
}

/**
 * Two-step category picker with realtime search.
 * "/" activates search — type to filter live, ↑/↓ to navigate results, Enter to pick, Esc to go back.
 */
export function CategorySelect({ categories, onSelect, onCancel }: CategorySelectProps) {
  const [step, setStep] = useState<"group" | "subcategory" | "search">("group");
  const [groupIdx, setGroupIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(0);
  const [searchBuffer, setSearchBuffer] = useState("");
  const [searchIdx, setSearchIdx] = useState(0);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const cat of categories) {
      if (!seen.has(cat.group)) {
        seen.add(cat.group);
        result.push(cat.group);
      }
    }
    return result;
  }, [categories]);

  const subcategories = useMemo(() => {
    if (step !== "subcategory") return [];
    const group = groups[groupIdx];
    return categories.filter((c) => c.group === group);
  }, [categories, groups, groupIdx, step]);

  const searchResults = useMemo(() => {
    if (step !== "search") return [];
    if (!searchBuffer) return categories;
    const term = searchBuffer.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(term) || c.group.toLowerCase().includes(term),
    );
  }, [categories, searchBuffer, step]);

  useInput((input, key) => {
    // Search mode
    if (step === "search") {
      if (key.escape) {
        setStep("group");
        setSearchBuffer("");
        return;
      }
      if (key.return) {
        const cat = searchResults[searchIdx];
        if (cat) onSelect(cat.id);
        return;
      }
      if (key.upArrow) {
        setSearchIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSearchIdx((i) => Math.min(searchResults.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.delete) {
        setSearchBuffer((b) => b.slice(0, -1));
        setSearchIdx(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchBuffer((b) => b + input);
        setSearchIdx(0);
        return;
      }
      return;
    }

    // Group step
    if (step === "group") {
      if (input === "/") {
        setStep("search");
        setSearchBuffer("");
        setSearchIdx(0);
        return;
      }
      if (key.upArrow) {
        setGroupIdx((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setGroupIdx((i) => Math.min(groups.length - 1, i + 1));
      } else if (key.return) {
        setStep("subcategory");
        setSubIdx(0);
      } else if (key.escape) {
        onCancel();
      }
      return;
    }

    // Subcategory step
    if (input === "/") {
      setStep("search");
      setSearchBuffer("");
      setSearchIdx(0);
      return;
    }
    if (key.upArrow) {
      setSubIdx((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSubIdx((i) => Math.min(subcategories.length - 1, i + 1));
    } else if (key.return) {
      const cat = subcategories[subIdx];
      if (cat) onSelect(cat.id);
    } else if (key.escape) {
      setStep("group");
    }
  });

  if (step === "search") {
    const visible = searchResults.slice(0, 12);
    return (
      <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
        <Box>
          <Text bold color="yellow">Buscar: </Text>
          <Text color="green">{searchBuffer}</Text>
          <Text color="green">|</Text>
          <Text dimColor> Enter=seleccionar Esc=volver</Text>
        </Box>
        {visible.length === 0 ? (
          <Text dimColor>Sin resultados</Text>
        ) : (
          visible.map((cat, i) => {
            const isSelected = i === searchIdx;
            return (
              <Box key={cat.id} gap={1}>
                <Text inverse={isSelected}>
                  {isSelected ? "\u25B6 " : "  "}
                  {cat.name}
                </Text>
                <Text dimColor>{cat.group}</Text>
              </Box>
            );
          })
        )}
        {searchResults.length > 12 && (
          <Text dimColor>...y {searchResults.length - 12} mas</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
      {step === "group" ? (
        <>
          <Text bold color="yellow">
            Seleccionar grupo (Enter=abrir, /=buscar, Esc=cancelar)
          </Text>
          {groups.map((g, i) => {
            const isSelected = i === groupIdx;
            return (
              <Box key={g}>
                <Text inverse={isSelected}>
                  {isSelected ? "\u25B6 " : "  "}
                  {g}
                </Text>
              </Box>
            );
          })}
        </>
      ) : (
        <>
          <Text bold color="yellow">
            {groups[groupIdx]} — Seleccionar categoria (Enter=confirmar, /=buscar, Esc=volver)
          </Text>
          {subcategories.map((cat, i) => {
            const isSelected = i === subIdx;
            return (
              <Box key={cat.id}>
                <Text inverse={isSelected}>
                  {isSelected ? "\u25B6 " : "  "}
                  {cat.name}
                </Text>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
