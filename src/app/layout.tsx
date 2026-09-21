import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const manrope = localFont({
  src: "../../assets/manrope-ew.woff2",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elysha Works | Service Professionals",
  description:
    "Websites and client systems built to turn interest into action.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
