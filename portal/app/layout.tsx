import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import Providers from "./providers";
import { AppLayout } from "@/components/AppLayout";
export const metadata: Metadata = { title: "Ethiopia Customs | Valuation Workspace", description: "HS classification, price evidence and valuation decision support for Ethiopian customs officers." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers><AppLayout>{children}</AppLayout></Providers></body></html>;
}
