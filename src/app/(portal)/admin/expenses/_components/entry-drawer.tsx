import { Drawer } from "@/components/ui/drawer";
import { EntryTypeSwitch } from "./entry-type-switch";
import { ExpenseForm } from "./expense-drawer";
import { IncomeForm } from "./income-drawer";
import type { CategoryRow, EntryKind, ExpenseRow, IncomeRow } from "./types";

interface EntryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which form is showing; switching swaps the body without closing the drawer */
  kind: EntryKind;
  onKindChange: (kind: EntryKind) => void;
  expenseCategories: CategoryRow[];
  incomeCategories: CategoryRow[];
  editingExpense: ExpenseRow | null;
  editingIncome: IncomeRow | null;
  onExpenseSuccess: () => void;
  onIncomeSuccess: () => void;
  /** Refetch categories after one is created inline (no toast) */
  onCategoriesChange: () => void;
}

/**
 * One drawer for both sides of the ledger. Holding a single Drawer open across
 * the switch keeps it from animating out and back in when the type changes.
 */
export function EntryDrawer({
  open,
  onClose,
  kind,
  onKindChange,
  expenseCategories,
  incomeCategories,
  editingExpense,
  editingIncome,
  onExpenseSuccess,
  onIncomeSuccess,
  onCategoriesChange,
}: EntryDrawerProps) {
  const editing = kind === "expense" ? !!editingExpense : !!editingIncome;
  const noun = kind === "expense" ? "Expense" : "Income";

  return (
    <Drawer open={open} onClose={onClose} title={`${editing ? "Edit" : "Add"} ${noun}`}>
      <div className="space-y-4">
        {!editing && <EntryTypeSwitch value={kind} onChange={onKindChange} />}

        {kind === "expense" ? (
          <ExpenseForm
            open={open}
            onClose={onClose}
            categories={expenseCategories}
            editingExpense={editingExpense}
            onSuccess={onExpenseSuccess}
          />
        ) : (
          <IncomeForm
            open={open}
            onClose={onClose}
            categories={incomeCategories}
            editingIncome={editingIncome}
            onSuccess={onIncomeSuccess}
            onCategoriesChange={onCategoriesChange}
          />
        )}
      </div>
    </Drawer>
  );
}
