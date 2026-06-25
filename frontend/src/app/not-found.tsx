import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="error-page" role="main">
      <div className="error-page-orb" aria-hidden="true" />
      <h1 className="error-page-code">404</h1>
      <p className="error-page-title">Seite nicht gefunden</p>
      <p className="error-page-text">
        Die angeforderte Seite existiert nicht oder wurde verschoben.
      </p>
      <Link href="/" className="btn btn-primary">Zur Startseite</Link>
    </main>
  );
}
