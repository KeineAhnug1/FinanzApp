'use client';

import '@/styles/globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body>
        <main className="error-page" role="main">
          <h1 className="error-page-code">Fehler</h1>
          <p className="error-page-title">Ein unerwarteter Fehler ist aufgetreten</p>
          <p className="error-page-text">{error.message || 'Bitte lade die Seite neu.'}</p>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Neu laden
          </button>
        </main>
      </body>
    </html>
  );
}
