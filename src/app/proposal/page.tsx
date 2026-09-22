import type { Metadata } from "next";

import { ProposalAccess } from "@/features/proposal/ProposalAccess";

export const metadata: Metadata = {
  title: "Your Private Roadmap | Elysha Works",
  description: "Open your private, time-limited Elysha Works strategy roadmap.",
  robots: { index: false, follow: false },
};

export default function ProposalPage() {
  return <ProposalAccess />;
}
