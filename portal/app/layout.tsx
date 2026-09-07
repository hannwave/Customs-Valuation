import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import Providers from "./providers";
import { AppLayout } from "@/components/AppLayout";
export const metadata: Metadata = { title: "SES Customs", description: "Customs application implementation skeleton" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers><AppLayout>{children}</AppLayout></Providers></body></html>;
}
