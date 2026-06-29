import { PublicFooter } from '@/components/layout/PublicFooter';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <div className="public-shell__main">{children}</div>
      <PublicFooter />
    </div>
  );
}
