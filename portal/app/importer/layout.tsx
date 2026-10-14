"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ImporterShell } from "@/components/importer/ImporterShell";
import { getSessionAccessToken } from "@/lib/auth/session";

/** Keeps the importer dashboard shell mounted across portal pages; public pages render without it. */
export default function ImporterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => setSignedIn(Boolean(getSessionAccessToken())), [pathname]);
  if (pathname === "/importer/register") return <>{children}</>;
  if (signedIn === null) return null;
  if (!signedIn && pathname === "/importer") return <>{children}</>;
  return <ImporterShell>{children}</ImporterShell>;
}
