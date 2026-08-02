import "@fontsource-variable/dm-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SplitTaste — Untangle shared recommendations",
  description:
    "A noncommercial research demo exploring user-controlled taste lanes for shared streaming accounts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

