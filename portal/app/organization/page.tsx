"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OrganizationRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to the proper administration route
    router.replace("/administration/organization");
  }, [router]);

  // Render nothing while redirecting
  return null;
}
