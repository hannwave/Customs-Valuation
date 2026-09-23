import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import Providers from "./providers";
import { AppLayout } from "@/components/AppLayout";
export const metadata: Metadata = { title: "Ethiopia Customs | Customs Valuation Portal", description: "Evidence-led customs valuation, tariff classification, and price intelligence for Ethiopia.", icons: { icon: [{ url: "/images/customs-logo-dark.png", type: "image/png", media: "(prefers-color-scheme: light)" }, { url: "/images/customs-logo-light.png", type: "image/png", media: "(prefers-color-scheme: dark)" }] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers><AppLayout>{children}</AppLayout></Providers></body></html>;
}
