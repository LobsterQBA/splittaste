import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";
import type { Metadata } from "next";
import { Analytics, type AnalyticsProps } from "@vercel/analytics/next";

const analyticsProxy = "/__analytics/splittaste";

function proxiedAnalyticsPath(value: string) {
  const pathname = value.startsWith("http") ? new URL(value).pathname : `/${value.replace(/^\//, "")}`;
  return `${analyticsProxy}${pathname}`;
}

function analyticsProps(): AnalyticsProps {
  const configString =
    process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG ??
    process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG;
  if (!configString) return {};

  const config = JSON.parse(configString).analytics ?? {};
  return Object.fromEntries(
    ["scriptSrc", "viewEndpoint", "eventEndpoint", "sessionEndpoint"]
      .filter((key) => config[key])
      .map((key) => [key, proxiedAnalyticsPath(config[key])]),
  );
}

export const metadata: Metadata = {
  title: "SplitTaste — Repair shared recommendations",
  description:
    "A product demo and MovieLens 32M evaluation of user-controlled taste repair for shared streaming accounts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics {...analyticsProps()} />
      </body>
    </html>
  );
}
