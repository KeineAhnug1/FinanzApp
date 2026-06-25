'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page" role="main">
      <div className="error-page-orb error-page-orb--warn" aria-hidden="true" />
      <h1 className="error-page-code">Fehler</h1>
      <p className="error-page-title">Etwas ist schiefgelaufen</p>
      <p className="error-page-text">
        Wir konnten diese Seite nicht laden. Bitte versuche es erneut.
      </p>
      <div className="error-page-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Erneut versuchen
        </button>
        <Link href="/" className="btn btn-ghost">Zur Startseite</Link>
      </div>
    </main>
  );
}
