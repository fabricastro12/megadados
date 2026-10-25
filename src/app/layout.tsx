import type { Metadata, Viewport } from 'next';
import { Baloo_2, Lilita_One } from 'next/font/google';
import { Settings } from '@/features/settings/Settings';
import './globals.css';

const lilita = Lilita_One({ weight: '400', subsets: ['latin'], variable: '--font-lilita', display: 'swap' });
const baloo = Baloo_2({ weight: ['500', '700', '800'], subsets: ['latin'], variable: '--font-baloo', display: 'swap' });

export const metadata: Metadata = {
  title: 'Megadados',
  description: 'La trivia de la Team Building de Megafy',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#3FB2EE',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${lilita.variable} ${baloo.variable}`}>
      <body>
        {children}
        <Settings />
      </body>
    </html>
  );
}
