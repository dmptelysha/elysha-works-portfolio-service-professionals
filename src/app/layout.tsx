import type { Metadata } from "next";
import "../../public/assets/fonts/fonts.css";
import "../../public/assets/vendor/scrollcraft/scrollcraft.css";
import "../../public/site.css";
import "../../public/scroll-scenes.css";
import "../../public/assets/v3-project-viewer.css";
import "../../public/assets/rhea-chat.css";
import "./globals.css";
import { LiveRuntime } from "./live-runtime";

export const metadata: Metadata = {
  title: "Elysha Works | Websites & Client Journeys",
  description:
    "Websites, funnels and connected client journeys for service professionals.",
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
      <body>
        {children}
        <LiveRuntime />
      </body>
    </html>
  );
}
