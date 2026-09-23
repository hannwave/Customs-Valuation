import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import Providers from "./providers";
import { AppLayout } from "@/components/AppLayout";
export const metadata: Metadata = { title: "Ethiopia Customs | Valuation Workspace", description: "HS classification, price evidence and valuation decision support for Ethiopian customs officers.", icons: { icon: [{ url: "/images/customs-logo-dark.png", type: "image/png", media: "(prefers-color-scheme: light)" }, { url: "/images/customs-logo-light.png", type: "image/png", media: "(prefers-color-scheme: dark)" }] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <head>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var m=localStorage.getItem("theme-mode")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.setAttribute("data-theme","dark");document.documentElement.classList.add("dark");}else{document.documentElement.setAttribute("data-theme","light");document.documentElement.classList.remove("dark");}document.documentElement.setAttribute("data-theme-mode",m);}catch(e){}})();`
        }}
      />
    </head>
    <body><Providers><AppLayout>{children}</AppLayout></Providers></body>
  </html>;
}
