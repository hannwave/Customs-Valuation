"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy compatibility route. Location registration now lives in Regions and Branches. */
export default function LocationsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/administration/regions"); }, [router]);
  return null;
}
