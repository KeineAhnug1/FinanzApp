interface FundingContribution {
  amount?: number;
}

export interface FundingView {
  contributions?: FundingContribution[];
}

interface FundingBalanceProps {
  funding: FundingView;
}

const moneyFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function formatMoney(n: number): string {
  return moneyFormatter.format(n);
}

export function FundingBalance({ funding }: FundingBalanceProps) {
  const contribs = funding.contributions ?? [];
  if (contribs.length === 0) return null;

  const amounts = contribs.map((c) => c.amount ?? 0).filter((n) => n > 0);
  if (amounts.length === 0) return null;

  const total = amounts.reduce((s, n) => s + n, 0);
  const avg = total / amounts.length;
  const max = Math.max(...amounts);

  return (
    <div className="funding-balance-detail">
      <span>{contribs.length} {contribs.length === 1 ? 'Spende' : 'Spenden'}</span>
      <span>•</span>
      <span>Ø {formatMoney(avg)}</span>
      <span>•</span>
      <span>größter Beitrag: {formatMoney(max)}</span>
    </div>
  );
}
