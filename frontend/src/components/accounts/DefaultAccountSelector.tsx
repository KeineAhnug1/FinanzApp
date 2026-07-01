'use client';

import { useQueryClient } from '@tanstack/react-query';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { toast } from '@/components/ui/Toast';

interface DefaultAccountSelectorProps {
  accountId: number;
  isDefault: boolean;
}

export function DefaultAccountSelector({ accountId, isDefault }: DefaultAccountSelectorProps) {
  const qc = useQueryClient();

  const handleSet = async () => {
    const res = await fetch(apiUrl('/api/users/me/default-account'), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ bank_account_id: accountId }),
    });
    const json = await safeJson(res);
    if (!json.ok) {
      toast.error(json.message ?? 'Fehler');
      return;
    }
    toast.success('Standardkonto gesetzt');
    qc.invalidateQueries({ queryKey: ['user', 'default-account'] });
    qc.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  if (isDefault) return <span className="default-account-badge">★ Standard</span>;
  return (
    <button type="button" className="default-account-toggle" onClick={handleSet}>
      Als Standard
    </button>
  );
}
