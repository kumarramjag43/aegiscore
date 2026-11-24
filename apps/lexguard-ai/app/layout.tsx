import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexGuard AI — Contract, Invoice & Fraud Intelligence",
  description:
    "Four cooperating agents read the instrument, score every red flag, quantify exposure and draft the counter-proposal. Powered by AegisCore.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#070c16]">{children}</body>
    </html>
  );
}
