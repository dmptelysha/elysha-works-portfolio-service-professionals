import type { Metadata } from "next";

import { ManualProposalAccess } from "@/features/manual-proposal/ManualProposalAccess";

export const metadata: Metadata = {
  title: "Private Proposal | Elysha Works",
  description: "Open your private Elysha Works proposal with your access code.",
  robots: { index: false, follow: false },
};

export default function ClientProposalPage() {
  return <ManualProposalAccess />;
}
