import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Zipper CRM",
  description: "Система управління магазином Zipper",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className="h-full" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* type switches to "text/plain" on client to suppress React 19 script warning;
            on the server (SSR) it stays "text/javascript" so it runs before first paint */}
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("crm-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.className} h-full`}>
        <SessionProvider>
          {children}
          <Toaster
            richColors
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
