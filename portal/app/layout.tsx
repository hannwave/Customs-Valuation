import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "country-flag-icons/3x2/flags.css";
import "./globals.css";
import "./importer.css";
import "./importer-onboarding.css";
import "./importer-portal.css";
import "./importer-case.css";
import "./importer-wizard.css";
import "./importer-declarations.css";
import "./hs-item.css";
import "./valuation-review.css";
import "./importer-profile.css";
import "./valuation-evidence.css";
import "./page-skeleton.css";
import "./invoice.css";
import "./toast.css";
import "./document-scan.css";
import Providers from "./providers";
import { AppLayout } from "@/components/AppLayout";
export const metadata: Metadata = { title: "Ethiopia Customs | Customs Valuation Portal", description: "Evidence-led customs valuation, tariff classification, and price intelligence for Ethiopia.", icons: { icon: [{ url: "/images/customs-logo-dark.png", type: "image/png", media: "(prefers-color-scheme: light)" }, { url: "/images/customs-logo-light.png", type: "image/png", media: "(prefers-color-scheme: dark)" }] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <head>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var sysDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var rem=sysDark?"light":"dark";var m=localStorage.getItem("theme-mode");if(m!==rem){m="system";}var d=m==="dark"||(m==="system"&&sysDark);if(d){document.documentElement.setAttribute("data-theme","dark");document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-mantine-color-scheme","dark");}else{document.documentElement.setAttribute("data-theme","light");document.documentElement.classList.remove("dark");document.documentElement.setAttribute("data-mantine-color-scheme","light");}document.documentElement.setAttribute("data-theme-mode",m);}catch(e){}})();`
        }}
      />
    </head>
    <body><Providers><AppLayout>{children}</AppLayout></Providers></body>
  </html>;
}
