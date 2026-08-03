import "@fontsource-variable/dm-sans";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SplitTaste — Repair shared recommendations",
  description:
    "A product demo and MovieLens 32M evaluation of user-controlled taste repair for shared streaming accounts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
