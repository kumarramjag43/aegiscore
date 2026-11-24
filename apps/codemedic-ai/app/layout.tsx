import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeMedic AI — Autonomous Code & API Security Auditor",
  description:
    "Four cooperating agents scan, score, heal and verify your code in real time. One AegisCore skeleton, powered by a pluggable LLM or the offline sandbox.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#04060b]">{children}</body>
    </html>
  );
}
