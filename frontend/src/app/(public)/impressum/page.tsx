import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum – FBM FinanzApp',
  description: 'Impressum und Anbieterkennzeichnung der FBM FinanzApp.',
};

export default function ImpressumPage() {
  return (
    <article className="legal-page">
      <h1>Impressum</h1>
      <p>
        Hier würde normalerweise das Impressum mit den Angaben des Anbieters stehen (Name, Anschrift, Kontakt etc.).
        Da es sich bei FBM FinanzApp um ein Universitätsprojekt handelt, verzichten wir auf ein vollständiges Impressum.
      </p>
    </article>
  );
}
