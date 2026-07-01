'use client';

export const runtime = 'edge';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import AccountsPage from '../page';
import { BankAccountHistoryModal } from '@/components/accounts/BankAccountHistoryModal';
import { apiUrl } from '@/lib/api-client';

interface BankAccountListItem {
  id: string;
  label?: string;
  name?: string;
}

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const accountId = Number(id);

  const { data: accounts = [] } = useQuery<BankAccountListItem[]>({
    queryKey: ['bank-accounts'],
    queryFn: () =>
      fetch(apiUrl('/api/finance/bank-accounts'), { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => d.accounts ?? []),
  });

  const account = accounts.find((a) => Number(a.id) === accountId);
  const label = account?.label || account?.name || 'Konto';

  return (
    <>
      <AccountsPage />
      {Number.isFinite(accountId) && (
        <BankAccountHistoryModal
          accountId={accountId}
          accountLabel={label}
          onClose={() => router.push('/accounts')}
        />
      )}
    </>
  );
}
