import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Pathport — folder delivery preflight',
  description:
    'Find case collisions, reserved filenames and path hazards before sharing a folder across operating systems.',
  alternates: { canonical: 'https://yougan001.github.io/pathport/' },
  icons: {
    icon: process.env.GITHUB_PAGES ? '/pathport/favicon.svg' : '/favicon.svg',
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
