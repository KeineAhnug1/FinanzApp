import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – FBM FinanzApp',
  description: 'Informationen zur Verarbeitung personenbezogener Daten in der FBM FinanzApp.',
};

export default function DatenschutzPage() {
  return (
    <article className="legal-page">
      <h1>Datenschutzerkl&auml;rung</h1>

      <section>
        <h2>1. Verantwortlicher</h2>
        <p>
          Verantwortlich f&uuml;r die Datenverarbeitung im Sinne der DSGVO ist die im
          {' '}<a href="/impressum">Impressum</a>{' '}genannte Person.
        </p>
      </section>

      <section>
        <h2>2. Erhobene Daten</h2>
        <ul>
          <li>Account-Daten: Username, E-Mail-Adresse, Passwort-Hash</li>
          <li>Finanzdaten: Konten, Transaktionen, Budgets, Gruppen und geteilte Sparziele</li>
          <li>Cookies: Session-Cookie sowie CSRF-Double-Submit-Token</li>
        </ul>
      </section>

      <section>
        <h2>3. Zweck der Verarbeitung</h2>
        <p>
          Die Verarbeitung erfolgt zur Erf&uuml;llung des Nutzungsvertrags
          (Art. 6 Abs. 1 lit. b DSGVO) und damit zur Bereitstellung der Funktionen
          der Anwendung, insbesondere der Verwaltung pers&ouml;nlicher Finanzen und
          gemeinsamer Gruppenfinanzen.
        </p>
      </section>

      <section>
        <h2>4. Speicherdauer</h2>
        <p>
          Personenbezogene Daten werden gespeichert, solange das Nutzerkonto besteht.
          Nach L&ouml;schung des Kontos werden alle personenbezogenen Daten innerhalb
          von 30 Tagen entfernt, soweit keine gesetzlichen Aufbewahrungspflichten
          entgegenstehen.
        </p>
      </section>

      <section>
        <h2>5. Rechte der betroffenen Personen</h2>
        <ul>
          <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
          <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
          <li>Recht auf L&ouml;schung (Art. 17 DSGVO)</li>
          <li>Recht auf Einschr&auml;nkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Recht auf Daten&uuml;bertragbarkeit (Art. 20 DSGVO)</li>
          <li>Recht auf Widerspruch (Art. 21 DSGVO)</li>
          <li>Recht auf Beschwerde bei einer Aufsichtsbeh&ouml;rde (Art. 77 DSGVO)</li>
        </ul>
      </section>

      <section>
        <h2>6. Auftragsverarbeiter</h2>
        <ul>
          <li>Supabase &ndash; Datenbank-Hosting (PostgreSQL), EU-Region</li>
          <li>Cloudflare Workers &ndash; Hosting der Anwendungslogik, EU-Region</li>
        </ul>
      </section>

      <section>
        <h2>7. Cookies</h2>
        <p>
          Es werden ausschlie&szlig;lich technisch notwendige Cookies verwendet:
          ein Session-Cookie zur Authentifizierung sowie ein CSRF-Token im Rahmen
          des Double-Submit-Verfahrens zum Schutz vor Cross-Site-Request-Forgery.
          Es findet kein Tracking und keine Analyse durch Drittanbieter statt.
        </p>
      </section>

      <section>
        <h2>8. Kontakt</h2>
        <p>
          Bei Fragen zum Datenschutz wenden Sie sich an die im
          {' '}<a href="/impressum">Impressum</a>{' '}angegebenen Kontaktdaten.
        </p>
      </section>
    </article>
  );
}
