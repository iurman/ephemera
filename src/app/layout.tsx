import "./globals.css";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/lib/trpc";

export const metadata: Metadata = {
  title: {
    default: "ephemera — share secrets that vanish",
    template: "%s · ephemera",
  },
  description:
    "Self-hosted, end-to-end encrypted secret sharing. Drops expire by time or view count, then they're gone for good.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-aurora min-h-screen font-sans antialiased">
        <TRPCProvider>{children}</TRPCProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-line-strong)",
              color: "var(--color-ink)",
            },
          }}
        />
      </body>
    </html>
  );
}
