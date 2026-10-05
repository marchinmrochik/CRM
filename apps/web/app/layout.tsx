import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Job Search OS',
  description: 'Your private remote job search workspace',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
