'use client';

import { EmptyState, IconArchive } from '@/components/ui/EmptyState';
import { formatMoney } from '@/components/groups/api';
import type { ArchivedFundingView } from '@/components/groups/types';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export function GroupArchiveSection({
  archivedFundings,
}: {
  groupId: number;
  archivedFundings: ArchivedFundingView[];
}) {
  if (!archivedFundings || archivedFundings.length === 0) {
    return (
      <div className="group-section">
        <h3 className="section-title">Archiv</h3>
        <EmptyState
          size="sm"
          icon={<IconArchive />}
          title="Nichts archiviert"
          description="Abgeschlossene Sammelaktionen erscheinen hier."
        />
      </div>
    );
  }

  return (
    <div className="group-section">
      <h3 className="section-title">Archiv</h3>
      <div className="funding-archive-list">
        {archivedFundings.map((f) => (
          <div key={f.id} className="funding-archive-item">
            <div>
              <div className="funding-title">{f.title}</div>
              <div className="funding-archive-meta">
                {formatMoney(f.current_amount)} / {formatMoney(f.target_amount)}
              </div>
            </div>
            <div className="funding-archive-date">archiviert am {formatDate(f.archived_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
