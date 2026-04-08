import React, { useState, useMemo, useCallback, useEffect } from "react";
import { render, Box, useInput, useApp, useStdout } from "ink";
import type { Db } from "../db/index.js";
import { loadConfig } from "../config.js";
import type { FilterState } from "./queries.js";
import { queryTransactions, queryCategories, queryAccounts, queryGroups, querySources } from "./queries.js";
import { aggregateByCategory, aggregateByGroup } from "./format.js";
import { editCategory } from "./review-logic.js";
import { Header, getHeaderHeight } from "./components/header.js";
import {
  TransactionsView,
  TRANSACTION_HEADERS,
  type SortColumn,
  type SortDirection,
  type FocusZone,
} from "./transactions.js";
import { RightPanel, getRightPanelChartHeights } from "./summary.js";
import { CategorySelect } from "./components/category-select.js";
import { FiltersModal } from "./components/filter-modal.js";

const STACK_BREAKPOINT = 120;
const LEFT_PANEL_FIXED_HEIGHT = 11;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function compareStrings(a: string, b: string) {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

interface DashboardAppProps {
  db: Db;
}

export function DashboardApp({ db }: DashboardAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal size
  const [termRows, setTermRows] = useState(stdout?.rows || 24);
  const [termCols, setTermCols] = useState(stdout?.columns || 80);
  useEffect(() => {
    const onResize = () => {
      setTermRows(stdout?.rows || 24);
      setTermCols(stdout?.columns || 80);
    };
    stdout?.on("resize", onResize);
    return () => { stdout?.off("resize", onResize); };
  }, [stdout]);
  const isStackedLayout = termCols < STACK_BREAKPOINT;
  const compactHeader = termRows < 22 || termCols < 110;
  const headerHeight = getHeaderHeight(compactHeader);
  const bodyHeight = Math.max(8, termRows - headerHeight);
  const stackedRightPanelHeight = Math.max(8, Math.floor(bodyHeight * 0.45));
  const stackedLeftPanelHeight = Math.max(8, bodyHeight - stackedRightPanelHeight);
  const pageSize = isStackedLayout
    ? Math.max(3, stackedLeftPanelHeight - LEFT_PANEL_FIXED_HEIGHT)
    : Math.max(3, bodyHeight - LEFT_PANEL_FIXED_HEIGHT);
  const outerPadding = 2;
  const leftPanelWidth = isStackedLayout ? termCols - outerPadding : Math.max(48, Math.floor((termCols - outerPadding) * 0.65));
  const rightPanelWidth = isStackedLayout ? termCols - outerPadding : Math.max(28, termCols - leftPanelWidth - outerPadding);
  const summaryAvailableWidth = Math.max(24, rightPanelWidth - 3);
  const rightPanelAvailableHeight = isStackedLayout
    ? stackedRightPanelHeight
    : bodyHeight;

  // ── Panel state ────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<"left" | "right">("left");
  const [groupSummaryScrollOffset, setGroupSummaryScrollOffset] = useState(0);
  const [categorySummaryScrollOffset, setCategorySummaryScrollOffset] = useState(0);

  // ── Left panel state ───────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>({});
  const [editMode, setEditMode] = useState(false);
  const [focusZone, setFocusZone] = useState<FocusZone>("rows");
  const [selectedRow, setSelectedRow] = useState(0);
  const [page, setPage] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [searchBuffer, setSearchBuffer] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Data queries ───────────────────────────────────────────────────────
  const config = useMemo(() => loadConfig(), []);
  const allAccounts = useMemo(() => queryAccounts(db), [db]);
  const allCategories = useMemo(() => queryCategories(db), [db]);
  const allGroups = useMemo(() => queryGroups(db), [db]);
  const allSources = useMemo(() => querySources(db), [db]);
  const rows = useMemo(() => queryTransactions(db, filters), [db, filters, refreshKey]);

  // ── Sort ────────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let result = 0;
      switch (sortColumn) {
        case "date": result = compareStrings(a.date, b.date); break;
        case "description": result = compareStrings(a.llmLabel || a.rawDescription, b.llmLabel || b.rawDescription); break;
        case "amount": result = a.amount - b.amount; break;
        case "category": result = compareStrings(a.categoryName || "", b.categoryName || ""); break;
        case "account": result = compareStrings(a.accountName, b.accountName); break;
      }
      if (result === 0) result = compareStrings(a.date, b.date) || a.id - b.id;
      return sortDirection === "asc" ? result : -result;
    });
    return sorted;
  }, [rows, sortColumn, sortDirection]);

  const { expenses: categoryExpenses, totalExpenses, totalIncome } = useMemo(
    () =>
      aggregateByCategory(
        rows.map((r) => ({
          amount: r.amount,
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          emoji: r.emoji,
          excludeFromSummary: r.excludeFromSummary ?? undefined,
        })),
      ),
    [rows],
  );

  const { groups: groupExpenses } = useMemo(
    () =>
      aggregateByGroup(
        rows.map((r) => ({
          amount: r.amount,
          categoryGroup: r.categoryGroup,
          categoryName: r.categoryName,
          excludeFromSummary: r.excludeFromSummary ?? undefined,
        })),
      ),
    [rows],
  );

  // ── Pagination ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = clamp(page, 0, totalPages - 1);
  const startIdx = safePage * pageSize;
  const visibleRows = sortedRows.slice(startIdx, startIdx + pageSize);
  const safeSelectedRow = clamp(selectedRow, 0, Math.max(0, visibleRows.length - 1));

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    if (selectedRow !== safeSelectedRow) setSelectedRow(safeSelectedRow);
  }, [safePage, safeSelectedRow, page, selectedRow]);

  const cycleSort = useCallback((column: SortColumn) => {
    if (sortColumn !== column) { setSortColumn(column); setSortDirection("asc"); }
    else if (sortDirection === "asc") setSortDirection("desc");
    else { setSortColumn(column); setSortDirection("asc"); }
    setPage(0);
    setSelectedRow(0);
  }, [sortColumn, sortDirection]);

  const handleSelectCategory = useCallback(
    (categoryId: number) => {
      const txn = sortedRows[startIdx + safeSelectedRow];
      if (!txn) return;
      editCategory(db, txn.id, categoryId).then(() => {
        const cat = allCategories.find((c) => c.id === categoryId);
        setStatusMsg(`Categoria actualizada: ${cat?.name || "?"}`);
        setEditMode(false);
        setRefreshKey((k) => k + 1);
      });
    },
    [db, sortedRows, startIdx, safeSelectedRow, allCategories],
  );

  const activeGroupNames = filters.groupNames?.length
    ? filters.groupNames
    : filters.groupName
      ? [filters.groupName]
      : [];
  const summarySelectedGroup = activeGroupNames.length === 1 ? activeGroupNames[0] : undefined;
  const summaryGroupLabel =
    activeGroupNames.length === 0
      ? "Todos"
      : activeGroupNames.length === 1
        ? activeGroupNames[0]
        : `${activeGroupNames.length} grupos`;
  const rightPanelShowFooter = activePanel !== "right" && allGroups.length > 0;
  const { topChartHeight, bottomChartHeight } = getRightPanelChartHeights(
    rightPanelAvailableHeight,
    rightPanelShowFooter,
  );
  const maxGroupSummaryScrollOffset = Math.max(0, groupExpenses.length - Math.max(1, topChartHeight - 1));
  const maxCategorySummaryScrollOffset = Math.max(0, categoryExpenses.length - Math.max(1, bottomChartHeight - 1));

  const handleSelectSummaryGroup = useCallback(
    (groupName: string | undefined) => {
      setFilters((current) => ({
        ...current,
        groupName: undefined,
        groupNames: groupName ? [groupName] : undefined,
      }));
      setGroupSummaryScrollOffset(0);
      setCategorySummaryScrollOffset(0);
      setPage(0);
      setSelectedRow(0);
      setStatusMsg(groupName ? `Filtro por grupo: ${groupName}` : "Filtro por grupo limpiado");
    },
    [],
  );

  useEffect(() => {
    setGroupSummaryScrollOffset((current) => Math.min(current, maxGroupSummaryScrollOffset));
  }, [maxGroupSummaryScrollOffset]);

  useEffect(() => {
    setCategorySummaryScrollOffset((current) => Math.min(current, maxCategorySummaryScrollOffset));
  }, [maxCategorySummaryScrollOffset]);

  // ── Keyboard input ─────────────────────────────────────────────────────
  useInput((input, key) => {
    // Edit mode — delegate to CategorySelect
    if (editMode) return;
    if (filtersModalOpen) return;

    if (input === "f") {
      setFiltersModalOpen(true);
      setStatusMsg(null);
      return;
    }

    if (input === "/") {
      setActivePanel("left");
      setFocusZone("search");
      return;
    }

    // Tab switches panels
    if (key.tab && focusZone !== "search") {
      setActivePanel((p) => (p === "left" ? "right" : "left"));
      return;
    }

    // Global quit (not during text input)
    if (input === "q" && focusZone !== "search") {
      exit();
      return;
    }

    // ── RIGHT PANEL ──────────────────────────────────────────────────
    if (activePanel === "right") {
      if (key.leftArrow) {
        const opts: Array<string | undefined> = [undefined, ...allGroups];
        const idx = Math.max(0, opts.indexOf(summarySelectedGroup));
        const next = (idx - 1 + opts.length) % opts.length;
        handleSelectSummaryGroup(opts[next]);
        return;
      }
      if (key.rightArrow) {
        const opts: Array<string | undefined> = [undefined, ...allGroups];
        const idx = Math.max(0, opts.indexOf(summarySelectedGroup));
        const next = (idx + 1) % opts.length;
        handleSelectSummaryGroup(opts[next]);
        return;
      }
      if (key.upArrow) {
        if (categorySummaryScrollOffset > 0) {
          setCategorySummaryScrollOffset((current) => Math.max(0, current - 1));
          return;
        }
        if (groupSummaryScrollOffset > 0) {
          setGroupSummaryScrollOffset((current) => Math.max(0, current - 1));
          return;
        }
        return;
      }
      if (key.downArrow) {
        if (maxGroupSummaryScrollOffset > groupSummaryScrollOffset) {
          setGroupSummaryScrollOffset((current) => Math.min(maxGroupSummaryScrollOffset, current + 1));
          return;
        }
        if (maxCategorySummaryScrollOffset > categorySummaryScrollOffset) {
          setCategorySummaryScrollOffset((current) => Math.min(maxCategorySummaryScrollOffset, current + 1));
          return;
        }
        return;
      }
      return;
    }

    // ── LEFT PANEL ───────────────────────────────────────────────────

    // Search zone
    if (focusZone === "search") {
      if (key.escape) {
        setSearchBuffer("");
        setFilters((f) => ({ ...f, search: undefined }));
        setFocusZone("rows");
        setPage(0);
        setSelectedRow(0);
        return;
      }
      if (key.downArrow || key.return) {
        setFocusZone("header");
        return;
      }
      if (key.backspace || key.delete) {
        setSearchBuffer((prev) => {
          const next = prev.slice(0, -1);
          setFilters((f) => ({ ...f, search: next || undefined }));
          setPage(0);
          setSelectedRow(0);
          return next;
        });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchBuffer((prev) => {
          const next = prev + input;
          setFilters((f) => ({ ...f, search: next }));
          setPage(0);
          setSelectedRow(0);
          return next;
        });
        return;
      }
      return;
    }

    // Header zone
    if (focusZone === "header") {
      if (key.upArrow) { setFocusZone("search"); return; }
      if (key.downArrow) { setFocusZone("rows"); setSelectedRow(0); return; }
      if (key.leftArrow) { setHeaderIndex((i) => clamp(i - 1, 0, TRANSACTION_HEADERS.length - 1)); return; }
      if (key.rightArrow) { setHeaderIndex((i) => clamp(i + 1, 0, TRANSACTION_HEADERS.length - 1)); return; }
      if (key.return) { cycleSort(TRANSACTION_HEADERS[headerIndex].key); return; }
      return;
    }

    // Rows zone
    if (focusZone === "rows") {
      if (key.upArrow) {
        if (safeSelectedRow === 0) setFocusZone("header");
        else setSelectedRow((r) => r - 1);
        setStatusMsg(null);
        return;
      }
      if (key.downArrow) {
        if (safeSelectedRow < visibleRows.length - 1) setSelectedRow((r) => r + 1);
        setStatusMsg(null);
        return;
      }
      if (key.leftArrow) {
        if (safePage > 0) { setPage((p) => p - 1); setSelectedRow(0); }
        return;
      }
      if (key.rightArrow) {
        if (safePage < totalPages - 1) { setPage((p) => p + 1); setSelectedRow(0); }
        return;
      }
      if (input === "e" && visibleRows.length > 0) {
        setEditMode(true);
        setStatusMsg(null);
        return;
      }
      return;
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" height={termRows}>
      <Header
        config={{ llmModel: config.llmModel }}
        accounts={allAccounts}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        transactionCount={rows.length}
        compact={compactHeader}
      />

      {filtersModalOpen ? (
        <FiltersModal
          open={filtersModalOpen}
          filters={filters}
          categories={allCategories}
          accounts={allAccounts}
          groups={allGroups}
          sources={allSources}
          termRows={termRows}
          termCols={termCols}
          onApply={(nextFilters) => {
            setFilters(nextFilters);
            setFiltersModalOpen(false);
            setPage(0);
            setSelectedRow(0);
            setFocusZone("rows");
          }}
          onClose={() => setFiltersModalOpen(false)}
        />
      ) : (
        <Box flexDirection={isStackedLayout ? "column" : "row"} flexGrow={1} height={bodyHeight}>
          <Box
            flexDirection="column"
            width={isStackedLayout ? "100%" : leftPanelWidth}
            height={isStackedLayout ? stackedLeftPanelHeight : bodyHeight}
            flexGrow={1}
            overflow="hidden"
          >
            <TransactionsView
              rows={visibleRows}
              totalResults={sortedRows.length}
              page={safePage + 1}
              totalPages={totalPages}
              focusZone={activePanel === "left" ? focusZone : "rows"}
              selectedRow={safeSelectedRow}
              headerIndex={headerIndex}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              searchBuffer={searchBuffer}
              filters={filters}
              categories={allCategories}
              accounts={allAccounts}
              statusMsg={statusMsg}
              panelFocused={activePanel === "left"}
            />

            {/* CategorySelect overlay */}
            {editMode && (
              <CategorySelect
                categories={allCategories}
                onSelect={handleSelectCategory}
                onCancel={() => setEditMode(false)}
              />
            )}
          </Box>

          <Box
            flexDirection="column"
            width={isStackedLayout ? "100%" : rightPanelWidth}
            height={isStackedLayout ? stackedRightPanelHeight : undefined}
            flexShrink={1}
          >
            <RightPanel
              focused={activePanel === "right"}
              groupExpenses={groupExpenses}
              categoryExpenses={categoryExpenses}
              groups={allGroups}
              selectedGroup={summarySelectedGroup}
              selectedGroupLabel={summaryGroupLabel}
              availableWidth={summaryAvailableWidth}
              availableHeight={rightPanelAvailableHeight}
              groupScrollOffset={groupSummaryScrollOffset}
              categoryScrollOffset={categorySummaryScrollOffset}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function renderDashboard(db: Db) {
  return render(React.createElement(DashboardApp, { db }));
}
