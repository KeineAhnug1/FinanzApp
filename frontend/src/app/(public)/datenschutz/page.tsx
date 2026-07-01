import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – FBM FinanzApp',
  description: 'Informationen zur Verarbeitung personenbezogener Daten in der FBM FinanzApp.',
};

export default function DatenschutzPage() {
  return (
    <article className="legal-page">
      <h1>Datenschutzerklärung</h1>
      <p>
        Hier würde normalerweise eine vollständige Datenschutzerklärung gemäß DSGVO stehen.
        Da es sich bei FBM FinanzApp um ein Universitätsprojekt handelt, verzichten wir auf eine
        vollständige Datenschutzerklärung.
      </p>
    </article>
  );
}
