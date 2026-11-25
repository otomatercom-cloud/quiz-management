"use client";
import { useEffect, useState } from "react";

export type PublicConfig = { require_email_otp: boolean; turnstile_site_key: string };

export function usePublicConfig(): PublicConfig | null {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public-config").then((r) => r.json()).then((j) => live && setCfg(j.data)).catch(() => live && setCfg({ require_email_otp: false, turnstile_site_key: "" }));
    return () => { live = false; };
  }, []);
  return cfg;
}
