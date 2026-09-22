import type { Metadata } from "next";

import "../../public/assets/fonts/fonts.css";
import "../../public/hero-roadmap.css";
import "./globals.css";
import "../styles/portfolio.css";

export const metadata: Metadata = {
  title: "Elysha Works | Strategy-First Business Systems",
  description:
    "Strategy-first websites, funnels, automation, and custom business systems for growing businesses.",
  icons: {
    icon: "/assets/elysha-favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
