'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

// Central invalidator for all finance-affecting mutations (income, expense, bank-account,
// recurring entries, group donations, stock trades). Call after any backend mutation that
// could move balances or change the transaction set, so the dashboard hero, charts, lists
// and budget alerts all re-fetch fresh data.
export function useFinanceInvalidator() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['budget-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['bank-account-history'] });
  }, [queryClient]);
}
