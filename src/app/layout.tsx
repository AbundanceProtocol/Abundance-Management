import type { Metadata } from "next";
import "./globals.css";

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
      </body>
    </html>
  );
}
