import Link from 'next/link';

const FOOTER_YEAR = 2026;

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__brand">
        &copy; {FOOTER_YEAR} FBM FinanzApp
      </div>
      <nav className="public-footer__links" aria-label="Rechtliche Hinweise">
        <Link href="/">Start</Link>
        <Link href="/impressum">Impressum</Link>
        <Link href="/datenschutz">Datenschutz</Link>
      </nav>
    </footer>
  );
}
