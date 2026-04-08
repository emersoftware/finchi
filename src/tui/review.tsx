import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Table, paginateRows } from "./components/table";
import { CategorySelect } from "./components/category-select";
import {
  loadPendingTransactions,
  loadCategories,
  confirmTransaction,
  confirmAll,
  editCategory,
  formatAmount,
  formatConfidence,
  displayDescription,
  type PendingTransaction,
  type CategoryRow,
} from "./review-logic";
import type { Db } from "../db/index";

const TABLE_PAGE_SIZE = 15;

const COLUMNS = [
  { key: "num", label: "#", width: 4, align: "right" as const },
  { key: "date", label: "Fecha", width: 12, align: "left" as const },
  { key: "description", label: "Descripcion", width: 35, align: "left" as const },
  { key: "amount", label: "Monto", width: 14, align: "right" as const },
  { key: "category", label: "Categoria", width: 20, align: "left" as const },
  { key: "confidence", label: "Conf.", width: 6, align: "right" as const },
];

function txnToRow(txn: PendingTransaction, index: number): Record<string, string> {
  const catDisplay = txn.categoryName || "Sin categoria";
  return {
    num: String(index + 1),
    date: txn.date,
    description: displayDescription(txn),
    amount: formatAmount(txn.amount),
    category: catDisplay,
    confidence: formatConfidence(txn.confidence),
  };
}

interface ReviewAppProps {
  db: Db;
}

export function ReviewApp({ db }: ReviewAppProps) {
  const { exit } = useApp();

  const [txns, setTxns] = useState<PendingTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [selectedRow, setSelectedRow] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadTransactions = async () => {
    setLoading(true);
    const pending = await loadPendingTransactions(db);
    setTxns(pending);
    setLoading(false);
    if (pending.length === 0) setSelectedRow(0);
    else setSelectedRow((prev) => Math.min(prev, pending.length - 1));
  };

  useEffect(() => {
    Promise.all([loadPendingTransactions(db), loadCategories(db)]).then(
      ([pending, cats]) => {
        setTxns(pending);
        setAllCategories(cats);
        setLoading(false);
      },
    );
  }, []);

  const handleSelectCategory = useCallback(
    (categoryId: number) => {
      const txn = txns[selectedRow];
      if (!txn) return;
      editCategory(db, txn.id, categoryId).then(() => {
        const cat = allCategories.find((c) => c.id === categoryId);
        setStatusMsg(`Categoria actualizada: ${cat?.name || "?"}`);
        setEditMode(false);
        reloadTransactions();
      });
    },
    [db, txns, selectedRow, allCategories],
  );

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
  }, []);

  useInput((input, key) => {
    if (loading || editMode) return;

    if (key.upArrow) {
      setSelectedRow((prev) => Math.max(0, prev - 1));
      setStatusMsg(null);
    } else if (key.downArrow) {
      setSelectedRow((prev) => Math.min(txns.length - 1, prev + 1));
      setStatusMsg(null);
    } else if (input === "e" && txns.length > 0) {
      setEditMode(true);
      setStatusMsg(null);
    } else if (input === "c" && txns.length > 0) {
      const txn = txns[selectedRow];
      if (txn) {
        confirmTransaction(db, txn).then(() => {
          setStatusMsg(`Transaccion #${selectedRow + 1} confirmada`);
          reloadTransactions();
        });
      }
    } else if (input === "a" && txns.length > 0) {
      const { start, end } = paginateRows(txns.length, selectedRow, TABLE_PAGE_SIZE);
      const visible = txns.slice(start, end);
      confirmAll(db, visible).then((count) => {
        setStatusMsg(`${count} transacciones confirmadas`);
        reloadTransactions();
      });
    } else if (input === "q") {
      exit();
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Cargando transacciones...</Text>
      </Box>
    );
  }

  if (txns.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">No hay transacciones pendientes de revision.</Text>
      </Box>
    );
  }

  const tableData = txns.map(txnToRow);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Review de transacciones pendientes ({txns.length} transacciones)
      </Text>
      <Box marginTop={1}>
        <Table
          columns={COLUMNS}
          data={tableData}
          selectedRow={selectedRow}
          pageSize={TABLE_PAGE_SIZE}
        />
      </Box>

      {editMode && (
        <CategorySelect
          categories={allCategories}
          onSelect={handleSelectCategory}
          onCancel={handleCancelEdit}
        />
      )}

      {statusMsg && (
        <Box marginTop={1}>
          <Text color="green">{statusMsg}</Text>
        </Box>
      )}

      {!editMode && (
        <Box marginTop={1}>
          <Text dimColor>
            ↑/↓ navegar | e editar categoria | c confirmar | a confirmar pagina | q salir
          </Text>
        </Box>
      )}
    </Box>
  );
}
