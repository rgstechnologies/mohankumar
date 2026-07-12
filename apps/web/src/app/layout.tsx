import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ContactWidget } from '@/components/contact-widget';
import { FeedbackProvider } from '@/components/feedback';
import { NoScrollNumber } from '@/components/no-scroll-number';
import { ThemeProvider } from '@/components/theme';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RGS ERP — Books, Billing & GST',
  description:
    'RGS ERP is a modern accounting & business ERP for Indian SMEs — GST invoicing, double-entry books, inventory and statutory reports.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

// Set the theme class before paint to avoid a flash. Light is the default
// (clean, Zoho-style) — only an explicit 'dark' preference opts in.
const themeScript = `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <NoScrollNumber />
            <FeedbackProvider>
              {children}
              <ContactWidget />
            </FeedbackProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
