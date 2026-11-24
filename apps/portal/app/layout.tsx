import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AegisCore — one skeleton, two industry products",
  description:
    "AegisCore is a single reusable multi-agent audit engine. It powers CodeMedic AI (DevSecOps) and LexGuard AI (legal & financial) from the exact same four-stage core.",
  keywords: ["AegisCore", "Kiroween", "Skeleton Crew", "multi-agent", "DevSecOps", "legal AI"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#05070e] text-slate-200">{children}</body>
    </html>
  );
}
