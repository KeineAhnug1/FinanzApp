'use client';

import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api-client';

interface ShareAccount {
  id: number;
  label: string;
}

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function ShareAccountSwitcher({ value, onChange }: Props) {
  const { data: shareAccounts = [] } = useQuery<ShareAccount[]>({
    queryKey: ['share-accounts'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/finance/share-accounts'), { credentials: 'include' });
      const d = await res.json() as { share_accounts?: ShareAccount[] };
      return d.share_accounts ?? [];
    },
  });

  return (
    <select
      className="share-account-switcher"
      aria-label="Aktienkonto wählen"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">Alle Aktienkonten</option>
      {shareAccounts.map((a) => (
        <option key={a.id} value={a.id}>{a.label}</option>
      ))}
    </select>
  );
}
