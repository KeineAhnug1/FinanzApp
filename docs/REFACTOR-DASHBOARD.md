# Dashboard Refactor Plan

## Why

`frontend/src/app/(app)/dashboard/page.tsx` is 873 lines and contains:
- `DrilldownCashflowChart` (Recharts line chart with drill-down logic)
- `CategoryPieChart` (Recharts pie chart with three modes)
- `BudgetAlerts` (alert list with category lookups)
- `IncomeFormComp` (react-hook-form + Zod for income entries)
- `ExpenseFormComp` (react-hook-form + Zod for expense entries)
- `GroupedList` (entries list grouped by month/category)
- The default-exported page component (state, queries, mutations, layout)

This is a "junior-to-intermediate" smell — useful logic locked in one file, hard to test, hard for a second developer to navigate.

## Target structure

```
frontend/src/components/dashboard/
├── DrilldownCashflowChart.tsx
├── CategoryPieChart.tsx
├── BudgetAlerts.tsx
├── IncomeForm.tsx
├── ExpenseForm.tsx
├── EntriesList.tsx
└── types.ts        # shared interfaces (IncomeEntry, ExpenseEntry, etc.)
```

Each file ~80–200 lines, exported as a named React component with a typed props interface. Schemas (Zod) live next to their forms.

## Step-by-step

1. **Extract types first.** Move `IncomeEntry`, `ExpenseEntry`, `CategoryKey` to `components/dashboard/types.ts`. Update imports in `page.tsx`.
2. **Extract `DrilldownCashflowChart`.** It's a pure UI component receiving `income`, `expenses`, `foundingYear` props. Move to its own file. Verify the chart still renders.
3. **Extract `CategoryPieChart`.** Same pattern; props are `income`, `expenses`, `mode`.
4. **Extract `BudgetAlerts`.** Verify the budget-fetch `useQuery` still works (move it into the component or hoist via prop).
5. **Extract `IncomeForm` and `ExpenseForm`.** Each owns its Zod schema, react-hook-form setup, and submit handler. Pass `onSuccess` callback for query invalidation.
6. **Extract `EntriesList` / `GroupedList`.** Display-only — easy.
7. **Slim down `page.tsx`** — should end up ~200 lines of orchestration: queries, state, layout, composing the extracted components.

## Risks

- Cross-cutting state (e.g., `editIncome` / `editExpense`) is currently held in the page. Decide: lift it higher, or move the form + its edit state into the form component.
- React Query keys must stay identical across the move so cache continuity is preserved.
- The CSS classes are global; no CSS changes needed.

## Verification

After each extraction step, run:
```sh
cd "/Users/I767629/Documents/Hochschule/Semester 1/Web-Engineering/FinanzApp"
(cd frontend && node_modules/.bin/tsc --noEmit)
(cd frontend && npm run build)
```
Then load the dashboard in a dev server and confirm chart, pie, forms, and entries list all render and accept input.

## Estimated effort

Half a focused day, including manual smoke after each extraction. Low risk if done incrementally with verification after each step.
