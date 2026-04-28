import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { QuickAccessFAB } from "../components/QuickAccessFAB";

export const metadata: Metadata = {
  title: "Project Manager - GTD + CPM",
  description: "Getting Things Done with Critical Path Method",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Suspense fallback={null}>
          <QuickAccessFAB />
        </Suspense>
      </body>
    </html>
  );
}
