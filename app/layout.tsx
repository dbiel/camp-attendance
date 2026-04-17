import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { CampConfigProvider } from '@/lib/camp-config-client';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'TTU Band & Orchestra Camp',
  description: 'Camp management and attendance tracking system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CampConfigProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </CampConfigProvider>
      </body>
    </html>
  );
}
