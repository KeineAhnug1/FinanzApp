import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum – FBM FinanzApp',
  description: 'Impressum und Anbieterkennzeichnung der FBM FinanzApp.',
};

export default function ImpressumPage() {
  return (
    <article className="legal-page">
      <h1>Impressum</h1>

      <section>
        <h2>Angaben gem&auml;&szlig; &sect; 5 TMG</h2>
        <p>
          [Name der verantwortlichen Person]<br />
          [Postanschrift, Stra&szlig;e und Hausnummer]<br />
          [PLZ und Ort]<br />
          [Land]
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail: [kontakt@beispiel.de]<br />
          Telefon (optional): [+49 000 0000000]
        </p>
      </section>

      <section>
        <h2>Verantwortlich f&uuml;r den Inhalt nach &sect; 55 Abs. 2 RStV</h2>
        <p>
          [Name der verantwortlichen Person]<br />
          [Postanschrift, identisch zu oben]
        </p>
      </section>

      <section>
        <h2>Hochschulprojekt</h2>
        <p>
          Diese Anwendung entstand im Rahmen eines studentischen Projekts an der Hochschule.
          Kein kommerzielles Angebot.
        </p>
      </section>

      <section>
        <h2>Haftungsausschluss</h2>

        <h3>Inhalt des Onlineangebots</h3>
        <p>
          Die Inhalte dieser Anwendung wurden mit gr&ouml;&szlig;tm&ouml;glicher Sorgfalt erstellt.
          F&uuml;r die Richtigkeit, Vollst&auml;ndigkeit und Aktualit&auml;t der Inhalte kann
          jedoch keine Gew&auml;hr &uuml;bernommen werden. Als Diensteanbieter sind wir gem&auml;&szlig;
          &sect; 7 Abs. 1 TMG f&uuml;r eigene Inhalte auf diesen Seiten nach den allgemeinen
          Gesetzen verantwortlich. Nach &sect;&sect; 8 bis 10 TMG sind wir als Diensteanbieter jedoch
          nicht verpflichtet, &uuml;bermittelte oder gespeicherte fremde Informationen zu &uuml;berwachen.
        </p>

        <h3>Verweise und Links</h3>
        <p>
          Diese Anwendung enth&auml;lt gegebenenfalls Links zu externen Webseiten Dritter, auf deren
          Inhalte wir keinen Einfluss haben. Deshalb k&ouml;nnen wir f&uuml;r diese fremden Inhalte
          auch keine Gew&auml;hr &uuml;bernehmen. F&uuml;r die Inhalte der verlinkten Seiten ist stets
          der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Eine permanente inhaltliche
          Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht
          zumutbar.
        </p>

        <h3>Urheberrecht</h3>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke unterliegen dem deutschen
          Urheberrecht. Die Vervielf&auml;ltigung, Bearbeitung, Verbreitung und jede Art der
          Verwertung au&szlig;erhalb der Grenzen des Urheberrechtes bed&uuml;rfen der schriftlichen
          Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind
          nur f&uuml;r den privaten, nicht kommerziellen Gebrauch gestattet.
        </p>
      </section>
    </article>
  );
}
