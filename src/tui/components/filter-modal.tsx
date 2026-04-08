import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { FilterState } from "../queries.js";
import { SOURCE_LABELS, countActiveFilters, getFilterChips } from "./filter-bar.js";

type ModalSection = "dates" | "groups" | "categories" | "accounts" | "amountTypes" | "sources";
type ListSection = Exclude<ModalSection, "dates">;
type AmountType = "income" | "expense";

interface SelectItem {
  id: string;
  label: string;
  meta?: string;
}

interface CategoryOption {
  id: number;
  name: string;
  group: string;
}

interface AccountOption {
  id: number;
  name: string;
}

interface FiltersModalProps {
  open: boolean;
  filters: FilterState;
  categories: CategoryOption[];
  accounts: AccountOption[];
  groups: string[];
  sources: string[];
  termRows: number;
  termCols: number;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
}

const SECTION_LABELS: Record<ModalSection, string> = {
  dates: "Fechas",
  groups: "Grupos",
  categories: "Categorias",
  accounts: "Bancos",
  amountTypes: "Flujo",
  sources: "Tipos",
};

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MODAL_SECTIONS: ModalSection[] = ["dates", "groups", "categories", "accounts", "amountTypes", "sources"];
const LIST_SECTIONS: ListSection[] = ["groups", "categories", "accounts", "amountTypes", "sources"];

function cloneFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    categoryIds: filters.categoryIds ? [...filters.categoryIds] : filters.categoryId !== undefined ? [filters.categoryId] : undefined,
    accountIds: filters.accountIds ? [...filters.accountIds] : filters.accountId !== undefined ? [filters.accountId] : undefined,
    groupNames: filters.groupNames ? [...filters.groupNames] : filters.groupName ? [filters.groupName] : undefined,
    amountTypes: filters.amountTypes ? [...filters.amountTypes] : filters.type ? [filters.type] : undefined,
    sources: filters.sources ? [...filters.sources] : filters.source ? [filters.source] : undefined,
  };
}

function cleanFilters(filters: FilterState): FilterState {
  const next: FilterState = {
    search: filters.search,
  };

  if (filters.from) next.from = filters.from;
  if (filters.to) next.to = filters.to;
  if (filters.groupNames?.length) next.groupNames = [...filters.groupNames];
  if (filters.categoryIds?.length) next.categoryIds = [...filters.categoryIds];
  if (filters.accountIds?.length) next.accountIds = [...filters.accountIds];
  if (filters.amountTypes?.length === 1) next.amountTypes = [...filters.amountTypes];
  if (filters.sources?.length) next.sources = [...filters.sources];

  return next;
}

function clearModalFilters(filters: FilterState): FilterState {
  return cleanFilters({ search: filters.search });
}

function toggleValue<T>(values: T[] | undefined, value: T): T[] | undefined {
  const current = values ?? [];
  if (current.includes(value)) {
    const next = current.filter((item) => item !== value);
    return next.length ? next : undefined;
  }
  return [...current, value];
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseIsoDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthTitle(date: Date) {
  return `${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

function isSameDay(a?: string, b?: string) {
  return Boolean(a && b && a === b);
}

function isWithinRange(date: string, from?: string, to?: string) {
  if (!from || !to) return false;
  return date > from && date < to;
}

function getWeekStart(date: Date) {
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, diff);
}

function buildCalendar(month: Date) {
  const first = startOfMonth(month);
  const start = getWeekStart(first);
  const weeks: Array<Array<{ date: Date; iso: string; inMonth: boolean }>> = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const days = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      days.push({
        date,
        iso: formatIsoDate(date),
        inMonth: date.getMonth() === month.getMonth(),
      });
    }
    weeks.push(days);
  }

  return weeks;
}

function ensureRange(filters: FilterState, field: "from" | "to", value: string): FilterState {
  if (field === "from") {
    return {
      ...filters,
      from: value,
      to: filters.to && filters.to < value ? value : filters.to,
    };
  }

  return {
    ...filters,
    to: value,
    from: filters.from && filters.from > value ? value : filters.from,
  };
}

function buildPresetRanges(today: Date) {
  const end = formatIsoDate(today);
  const monthStart = formatIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const previousMonthStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEndDate = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { key: "1", label: "Hoy", from: end, to: end },
    { key: "2", label: "7 dias", from: formatIsoDate(addDays(today, -6)), to: end },
    { key: "3", label: "30 dias", from: formatIsoDate(addDays(today, -29)), to: end },
    { key: "4", label: "Mes actual", from: monthStart, to: end },
    { key: "5", label: "Mes anterior", from: formatIsoDate(previousMonthStartDate), to: formatIsoDate(previousMonthEndDate) },
    { key: "6", label: "Anio actual", from: `${today.getFullYear()}-01-01`, to: end },
  ];
}

function getListCursorMax(items: SelectItem[]) {
  return Math.max(0, items.length - 1);
}

function getVisibleSlice<T>(items: T[], cursor: number, visibleCount: number) {
  const maxOffset = Math.max(0, items.length - visibleCount);
  const offset = Math.max(0, Math.min(cursor - Math.floor(visibleCount / 2), maxOffset));
  return {
    offset,
    visible: items.slice(offset, offset + visibleCount),
  };
}

export function FiltersModal({
  open,
  filters,
  categories,
  accounts,
  groups,
  sources,
  termRows,
  termCols,
  onApply,
  onClose,
}: FiltersModalProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const presets = useMemo(() => buildPresetRanges(today), [today]);
  const [draft, setDraft] = useState<FilterState>(() => cloneFilters(filters));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [dateField, setDateField] = useState<"from" | "to">("from");
  const [calendarCursor, setCalendarCursor] = useState(formatIsoDate(today));
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(today));
  const [queries, setQueries] = useState<Record<ListSection, string>>({
    groups: "",
    categories: "",
    accounts: "",
    amountTypes: "",
    sources: "",
  });
  const [cursors, setCursors] = useState<Record<ListSection, number>>({
    groups: 0,
    categories: 0,
    accounts: 0,
    amountTypes: 0,
    sources: 0,
  });

  useEffect(() => {
    if (!open) return;
    const nextDraft = cloneFilters(filters);
    const anchor = nextDraft.to || nextDraft.from || formatIsoDate(today);
    const anchorDate = parseIsoDate(anchor) || today;

    setDraft(nextDraft);
    setSectionIndex(0);
    setSearchMode(false);
    setDateField("from");
    setCalendarCursor(anchor);
    setCalendarMonth(startOfMonth(anchorDate));
    setQueries({
      groups: "",
      categories: "",
      accounts: "",
      amountTypes: "",
      sources: "",
    });
    setCursors({
      groups: 0,
      categories: 0,
      accounts: 0,
      amountTypes: 0,
      sources: 0,
    });
  }, [filters, open, today]);

  const section = MODAL_SECTIONS[sectionIndex];
  const selectedGroups = draft.groupNames ?? [];
  const filteredCategoryOptions = useMemo(() => {
    if (!selectedGroups.length) return categories;
    return categories.filter((category) => selectedGroups.includes(category.group));
  }, [categories, selectedGroups]);

  const listItems = useMemo<Record<ListSection, SelectItem[]>>(
    () => ({
      groups: groups.map((group) => ({ id: group, label: group, meta: "Grupo" })),
      categories: filteredCategoryOptions.map((category) => ({
        id: String(category.id),
        label: category.name,
        meta: category.group,
      })),
      accounts: accounts.map((account) => ({ id: String(account.id), label: account.name, meta: "Banco" })),
      amountTypes: [
        { id: "income", label: "Ingresos", meta: "Solo movimientos positivos" },
        { id: "expense", label: "Egresos", meta: "Solo movimientos negativos" },
      ],
      sources: sources.map((source) => ({
        id: source,
        label: SOURCE_LABELS[source] || source,
        meta: source,
      })),
    }),
    [accounts, filteredCategoryOptions, groups, sources],
  );

  const filteredListItems = useMemo<Record<ListSection, SelectItem[]>>(() => {
    const next = {} as Record<ListSection, SelectItem[]>;

    for (const listSection of LIST_SECTIONS) {
      const query = queries[listSection].trim().toLowerCase();
      const baseItems = listItems[listSection];
      next[listSection] = query
        ? baseItems.filter((item) => {
            const haystack = `${item.label} ${item.meta || ""}`.toLowerCase();
            return haystack.includes(query);
          })
        : baseItems;
    }

    return next;
  }, [listItems, queries]);

  useEffect(() => {
    setCursors((current) => ({
      groups: Math.min(current.groups, getListCursorMax(filteredListItems.groups)),
      categories: Math.min(current.categories, getListCursorMax(filteredListItems.categories)),
      accounts: Math.min(current.accounts, getListCursorMax(filteredListItems.accounts)),
      amountTypes: Math.min(current.amountTypes, getListCursorMax(filteredListItems.amountTypes)),
      sources: Math.min(current.sources, getListCursorMax(filteredListItems.sources)),
    }));
  }, [filteredListItems]);

  const activeChips = getFilterChips(draft, categories, accounts);
  const activeCount = countActiveFilters(draft);

  function setQuery(sectionKey: ListSection, value: string) {
    setQueries((current) => ({ ...current, [sectionKey]: value }));
    setCursors((current) => ({ ...current, [sectionKey]: 0 }));
  }

  function moveSection(delta: number) {
    setSectionIndex((current) => (current + delta + MODAL_SECTIONS.length) % MODAL_SECTIONS.length);
    setSearchMode(false);
  }

  function toggleSelection(listSection: ListSection, itemId: string) {
    if (listSection === "groups") {
      setDraft((current) => {
        const nextGroups = toggleValue(current.groupNames, itemId);
        const allowedCategoryIds = nextGroups?.length
          ? new Set(categories.filter((category) => nextGroups.includes(category.group)).map((category) => category.id))
          : undefined;
        const nextCategoryIds = current.categoryIds?.filter((id) => !allowedCategoryIds || allowedCategoryIds.has(id));

        return cleanFilters({
          ...current,
          groupNames: nextGroups,
          categoryIds: nextCategoryIds?.length ? nextCategoryIds : undefined,
        });
      });
      return;
    }

    if (listSection === "categories") {
      setDraft((current) =>
        cleanFilters({
          ...current,
          categoryIds: toggleValue(current.categoryIds, Number(itemId)),
        }),
      );
      return;
    }

    if (listSection === "accounts") {
      setDraft((current) =>
        cleanFilters({
          ...current,
          accountIds: toggleValue(current.accountIds, Number(itemId)),
        }),
      );
      return;
    }

    if (listSection === "amountTypes") {
      setDraft((current) =>
        cleanFilters({
          ...current,
          amountTypes: toggleValue(current.amountTypes, itemId as AmountType),
        }),
      );
      return;
    }

    setDraft((current) =>
      cleanFilters({
        ...current,
        sources: toggleValue(current.sources, itemId),
      }),
    );
  }

  function clearCurrentSection() {
    if (section === "dates") {
      setDraft((current) =>
        cleanFilters({
          ...current,
          [dateField]: undefined,
        }),
      );
      return;
    }

    if (section === "groups") {
      setDraft((current) => cleanFilters({ ...current, groupNames: undefined, categoryIds: undefined }));
      return;
    }

    if (section === "categories") {
      setDraft((current) => cleanFilters({ ...current, categoryIds: undefined }));
      return;
    }

    if (section === "accounts") {
      setDraft((current) => cleanFilters({ ...current, accountIds: undefined }));
      return;
    }

    if (section === "amountTypes") {
      setDraft((current) => cleanFilters({ ...current, amountTypes: undefined }));
      return;
    }

    setDraft((current) => cleanFilters({ ...current, sources: undefined }));
  }

  function selectAllVisible(listSection: ListSection) {
    const items = filteredListItems[listSection];
    if (!items.length) return;

    if (listSection === "groups") {
      const nextGroups = items.map((item) => item.id);
      const allowedCategoryIds = new Set(categories.filter((category) => nextGroups.includes(category.group)).map((category) => category.id));
      setDraft((current) =>
        cleanFilters({
          ...current,
          groupNames: nextGroups,
          categoryIds: current.categoryIds?.filter((id) => allowedCategoryIds.has(id)),
        }),
      );
      return;
    }

    if (listSection === "categories") {
      setDraft((current) => cleanFilters({ ...current, categoryIds: items.map((item) => Number(item.id)) }));
      return;
    }

    if (listSection === "accounts") {
      setDraft((current) => cleanFilters({ ...current, accountIds: items.map((item) => Number(item.id)) }));
      return;
    }

    if (listSection === "amountTypes") {
      setDraft((current) => cleanFilters({ ...current, amountTypes: items.map((item) => item.id as AmountType) }));
      return;
    }

    setDraft((current) => cleanFilters({ ...current, sources: items.map((item) => item.id) }));
  }

  function applyDateSelection(date: string) {
    setDraft((current) => cleanFilters(ensureRange(current, dateField, date)));
  }

  useInput((input, key) => {
    if (!open) return;

    if (!searchMode && input === "f") {
      onApply(cleanFilters(draft));
      return;
    }

    if (key.escape) {
      if (searchMode && section !== "dates") {
        setSearchMode(false);
        return;
      }
      onClose();
      return;
    }

    if (!searchMode && input === "x") {
      setDraft(clearModalFilters(filters));
      setSearchMode(false);
      return;
    }

    if (key.tab) {
      moveSection(1);
      return;
    }

    if (section === "dates") {
      if (input === "t") {
        setDateField((current) => (current === "from" ? "to" : "from"));
        return;
      }
      if (input === "c") {
        clearCurrentSection();
        return;
      }
      if (input === "n") {
        setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
        return;
      }
      if (input === "p") {
        setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
        return;
      }

      const preset = presets.find((item) => item.key === input);
      if (preset) {
        setDraft((current) => cleanFilters({ ...current, from: preset.from, to: preset.to }));
        const anchorDate = parseIsoDate(preset.to) || today;
        setCalendarCursor(preset.to);
        setCalendarMonth(startOfMonth(anchorDate));
        return;
      }

      if (key.leftArrow) {
        const next = addDays(parseIsoDate(calendarCursor) || today, -1);
        setCalendarCursor(formatIsoDate(next));
        setCalendarMonth(startOfMonth(next));
        return;
      }
      if (key.rightArrow) {
        const next = addDays(parseIsoDate(calendarCursor) || today, 1);
        setCalendarCursor(formatIsoDate(next));
        setCalendarMonth(startOfMonth(next));
        return;
      }
      if (key.upArrow) {
        const next = addDays(parseIsoDate(calendarCursor) || today, -7);
        setCalendarCursor(formatIsoDate(next));
        setCalendarMonth(startOfMonth(next));
        return;
      }
      if (key.downArrow) {
        const next = addDays(parseIsoDate(calendarCursor) || today, 7);
        setCalendarCursor(formatIsoDate(next));
        setCalendarMonth(startOfMonth(next));
        return;
      }
      if (key.return) {
        applyDateSelection(calendarCursor);
      }
      return;
    }

    const listSection = section;
    const items = filteredListItems[listSection];
    const cursor = cursors[listSection];

    if (searchMode) {
      if (key.backspace || key.delete) {
        setQuery(listSection, queries[listSection].slice(0, -1));
        return;
      }
      if (key.upArrow) {
        setCursors((current) => ({ ...current, [listSection]: Math.max(0, current[listSection] - 1) }));
        return;
      }
      if (key.downArrow) {
        setCursors((current) => ({
          ...current,
          [listSection]: Math.min(getListCursorMax(items), current[listSection] + 1),
        }));
        return;
      }
      if (key.return || input === " ") {
        const item = items[cursor];
        if (item) toggleSelection(listSection, item.id);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setQuery(listSection, queries[listSection] + input);
      }
      return;
    }

    if (input === "/") {
      setSearchMode(true);
      return;
    }
    if (input === "a") {
      selectAllVisible(listSection);
      return;
    }
    if (input === "c") {
      clearCurrentSection();
      return;
    }
    if (key.upArrow) {
      setCursors((current) => ({ ...current, [listSection]: Math.max(0, current[listSection] - 1) }));
      return;
    }
    if (key.downArrow) {
      setCursors((current) => ({
        ...current,
        [listSection]: Math.min(getListCursorMax(items), current[listSection] + 1),
      }));
      return;
    }
    if (key.return || input === " ") {
      const item = items[cursor];
      if (item) toggleSelection(listSection, item.id);
    }
  });

  if (!open) return null;

  const modalWidth = Math.min(116, Math.max(60, termCols - 4));
  const modalHeight = Math.min(32, Math.max(22, termRows - 2));
  const listVisibleCount = Math.max(8, modalHeight - 18);
  const currentListSection = section === "dates" ? undefined : section;
  const currentItems = currentListSection ? filteredListItems[currentListSection] : [];
  const currentCursor = currentListSection ? cursors[currentListSection] : 0;
  const { offset, visible } = currentListSection
    ? getVisibleSlice(currentItems, currentCursor, listVisibleCount)
    : { offset: 0, visible: [] };
  const calendar = buildCalendar(calendarMonth);

  const currentSelectionCount =
    section === "groups" ? draft.groupNames?.length || 0
      : section === "categories" ? draft.categoryIds?.length || 0
        : section === "accounts" ? draft.accountIds?.length || 0
          : section === "amountTypes" ? draft.amountTypes?.length || 0
            : section === "sources" ? draft.sources?.length || 0
              : 0;

  return (
    <Box width="100%" height="100%" justifyContent="center" alignItems="center">
      <Box width={modalWidth} minHeight={modalHeight} borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
        <Box justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">Filtros</Text>
            <Text dimColor>
              {activeCount > 0 ? `${activeCount} activos` : "Sin filtros activos"} | f aplicar | Esc cancelar | x limpiar todo
            </Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <Text color="green">{draft.from || "..."} {"→"} {draft.to || "..."}</Text>
            <Text dimColor>{section === "dates" ? "Calendario activo" : `${SECTION_LABELS[section]} con finder`}</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexWrap="wrap" gap={1}>
          {MODAL_SECTIONS.map((item, index) => {
            const active = index === sectionIndex;
            return (
              <Text
                key={item}
                color={active ? "black" : "cyan"}
                backgroundColor={active ? "cyan" : undefined}
              >
                {" "}
                {SECTION_LABELS[item]}
                {" "}
              </Text>
            );
          })}
        </Box>

        <Box marginTop={1} flexWrap="wrap" gap={1}>
          {activeChips.length === 0 ? (
            <Text dimColor>Todo el dataset esta visible.</Text>
          ) : (
            activeChips.slice(0, 6).map((chip) => (
              <Text key={chip} color="black" backgroundColor="green">
                {" "}
                {chip}
                {" "}
              </Text>
            ))
          )}
          {activeChips.length > 6 && <Text dimColor>+{activeChips.length - 6} mas</Text>}
        </Box>

        <Box marginTop={1} flexDirection="column" flexGrow={1}>
          {section === "dates" ? (
            <>
              <Box flexWrap="wrap" gap={1}>
                {presets.map((preset) => {
                  const selected = draft.from === preset.from && draft.to === preset.to;
                  return (
                    <Text
                      key={preset.key}
                      color={selected ? "black" : "yellow"}
                      backgroundColor={selected ? "yellow" : undefined}
                    >
                      {" "}
                      {preset.key}. {preset.label}
                      {" "}
                    </Text>
                  );
                })}
              </Box>

              <Box marginTop={1} gap={1}>
                <Box borderStyle="round" borderColor={dateField === "from" ? "cyan" : "gray"} paddingX={1} flexGrow={1}>
                  <Text bold={dateField === "from"} color={dateField === "from" ? "cyan" : undefined}>
                    Desde: {draft.from || "---"}
                  </Text>
                </Box>
                <Box borderStyle="round" borderColor={dateField === "to" ? "cyan" : "gray"} paddingX={1} flexGrow={1}>
                  <Text bold={dateField === "to"} color={dateField === "to" ? "cyan" : undefined}>
                    Hasta: {draft.to || "---"}
                  </Text>
                </Box>
              </Box>

              <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} paddingY={1}>
                <Text bold color="yellow">{formatMonthTitle(calendarMonth)}</Text>
                <Box gap={1} marginTop={1}>
                  {WEEKDAY_LABELS.map((label) => (
                    <Text key={label} bold color="gray">{label.padStart(2, " ")}</Text>
                  ))}
                </Box>

                {calendar.map((week, weekIndex) => (
                  <Box key={weekIndex} gap={1}>
                    {week.map((cell) => {
                      const isCursor = cell.iso === calendarCursor;
                      const isBoundary = isSameDay(cell.iso, draft.from) || isSameDay(cell.iso, draft.to);
                      const inRange = isWithinRange(cell.iso, draft.from, draft.to);
                      const isToday = cell.iso === formatIsoDate(today);

                      return (
                        <Text
                          key={cell.iso}
                          inverse={isCursor}
                          color={
                            isBoundary ? "black"
                              : isToday ? "green"
                                : inRange ? "yellow"
                                  : cell.inMonth ? undefined : "gray"
                          }
                          backgroundColor={isBoundary ? "cyan" : undefined}
                        >
                          {String(cell.date.getDate()).padStart(2, " ")}
                        </Text>
                      );
                    })}
                  </Box>
                ))}
              </Box>

              <Text dimColor>
                ↑↓←→ mover · Enter fijar fecha · t cambia desde/hasta · n/p cambia mes · c limpia campo · 1-6 rangos rapidos
              </Text>
            </>
          ) : (
            <>
              <Box justifyContent="space-between">
                <Text bold color="yellow">{SECTION_LABELS[section]}</Text>
                <Text dimColor>{currentSelectionCount} seleccionados</Text>
              </Box>

              <Box marginTop={1} borderStyle="round" borderColor={searchMode ? "cyan" : "gray"} paddingX={1}>
                <Text bold color={searchMode ? "cyan" : "gray"}>Finder:</Text>
                <Text color="green"> {queries[section]}</Text>
                {searchMode && <Text color="green">▌</Text>}
                {!queries[section] && <Text dimColor> / abrir finder</Text>}
              </Box>

              <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
                {visible.length === 0 ? (
                  <Text dimColor>No hay resultados para este finder.</Text>
                ) : (
                  visible.map((item, visibleIndex) => {
                    const absoluteIndex = offset + visibleIndex;
                    const isSelected = absoluteIndex === currentCursor;
                    const checked =
                      section === "groups" ? draft.groupNames?.includes(item.id)
                        : section === "categories" ? draft.categoryIds?.includes(Number(item.id))
                          : section === "accounts" ? draft.accountIds?.includes(Number(item.id))
                            : section === "amountTypes" ? draft.amountTypes?.includes(item.id as AmountType)
                              : draft.sources?.includes(item.id);

                    return (
                      <Box key={item.id} justifyContent="space-between">
                        <Text inverse={isSelected}>
                          {checked ? "[x]" : "[ ]"} {item.label}
                        </Text>
                        {item.meta && <Text dimColor>{item.meta}</Text>}
                      </Box>
                    );
                  })
                )}
                {currentItems.length > visible.length && (
                  <Text dimColor>
                    {offset + 1}-{offset + visible.length} de {currentItems.length}
                  </Text>
                )}
              </Box>

              <Text dimColor>
                ↑↓ navegar · Espacio marcar · / finder · a seleccionar visibles · c limpiar seccion · Tab siguiente seccion
              </Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
