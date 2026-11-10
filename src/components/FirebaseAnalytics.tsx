"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/firebase";

// Private areas (admin, account, seller portal, payment, verification links) are not tracked.
const SKIP = /^\/(admin|account|seller|pay|verify|verify-email)(\/|$)/;

/** Sends a page_view on first load and on every client-side navigation (live site only). */
export function FirebaseAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || SKIP.test(pathname)) return;
    if (!/(^|\.)sidebooster\.com$/.test(window.location.hostname)) return; // skip localhost/staging
    track("page_view", { page_path: pathname, page_location: window.location.href, page_title: document.title });
  }, [pathname]);
  return null;
}
