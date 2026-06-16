import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'FinanzApp',
  description: 'Persönliche Finanzverwaltung',
};

const themeInitScript = `(function(){try{var s=localStorage.getItem("finanzapp.themeMode");var m=s==="light"||s==="dark"||s==="auto"?s:"auto";var r=m==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;document.documentElement.dataset.theme=r;document.documentElement.dataset.themeMode=m;var c=localStorage.getItem("finanzapp.contrast");if(c==="high")document.documentElement.dataset.contrast="high";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
