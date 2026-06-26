import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntriesList } from '../EntriesList';
import type { AnyEntry, IncomeEntry, ExpenseEntry } from '../types';

function makeIncome(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: '1',
    source: 'Gehalt',
    amount: 100,
    category: 'salary',
    cycle: 'once',
    received_at: '2026-01-15',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: '1',
    source: 'Miete',
    amount: 800,
    category: 'rent',
    cycle: 'once',
    spent_at: '2026-01-15',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

describe('EntriesList', () => {
  it('shows the income empty state and triggers onAddClick from the CTA', async () => {
    const user = userEvent.setup();
    const onAddClick = vi.fn();
    render(
      <EntriesList
        entries={[]}
        type="income"
        onEdit={() => {}}
        onDelete={() => {}}
        onAddClick={onAddClick}
      />
    );

    expect(screen.getByText('Noch keine Einnahmen')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Einnahme erfassen' });
    expect(cta).toBeInTheDocument();

    await user.click(cta);
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });

  it('omits the CTA in the empty state when no onAddClick is provided', () => {
    render(
      <EntriesList
        entries={[]}
        type="income"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('Noch keine Einnahmen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einnahme erfassen' })).not.toBeInTheDocument();
  });

  it('renders the expense empty-state copy and CTA label', () => {
    render(
      <EntriesList
        entries={[]}
        type="expense"
        onEdit={() => {}}
        onDelete={() => {}}
        onAddClick={() => {}}
      />
    );

    expect(screen.getByText('Noch keine Ausgaben')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausgabe erfassen' })).toBeInTheDocument();
  });

  it('shows the no-match message when the search filters everything out', async () => {
    const user = userEvent.setup();
    const entries: AnyEntry[] = [
      makeIncome({ id: '1', source: 'Gehalt', category: 'salary' }),
      makeIncome({ id: '2', source: 'Bonus Q1', category: 'bonus' }),
    ];

    render(
      <EntriesList
        entries={entries}
        type="income"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const search = screen.getByPlaceholderText('Suchen…');
    await user.type(search, 'xyz');

    expect(screen.getByText('Keine Treffer für deine Suche.')).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Einnahmen')).not.toBeInTheDocument();
  });

  it('renders grouped entries with year buckets, sources and formatted amounts', () => {
    const entries: AnyEntry[] = [
      makeIncome({ id: '1', source: 'Gehalt Januar', amount: 2500, received_at: '2026-01-15' }),
      makeIncome({ id: '2', source: 'Quartalsbonus', amount: 500, category: 'bonus', received_at: '2026-02-10' }),
      makeIncome({ id: '3', source: 'Freelance Projekt', amount: 1200, category: 'freelance', received_at: '2025-12-05' }),
    ];

    render(
      <EntriesList
        entries={entries}
        type="income"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();

    expect(screen.getByText('Gehalt Januar')).toBeInTheDocument();
    expect(screen.getByText('Quartalsbonus')).toBeInTheDocument();
    expect(screen.getByText('Freelance Projekt')).toBeInTheDocument();

    expect(screen.getAllByText(/2\.500,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^500,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.200,00\s?€/).length).toBeGreaterThan(0);
  });

  it('filters entries by source substring (case-insensitive)', async () => {
    const user = userEvent.setup();
    const entries: AnyEntry[] = [
      makeExpense({ id: '1', source: 'Miete', amount: 800, category: 'rent', spent_at: '2026-01-01' }),
      makeExpense({ id: '2', source: 'Edeka', amount: 45, category: 'groceries', spent_at: '2026-01-03' }),
    ];

    render(
      <EntriesList
        entries={entries}
        type="expense"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const search = screen.getByPlaceholderText('Suchen…');
    await user.type(search, 'edek');

    expect(screen.getByText('Edeka')).toBeInTheDocument();
    expect(screen.queryByText('Miete')).not.toBeInTheDocument();
  });
});
