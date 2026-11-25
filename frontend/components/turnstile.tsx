"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void } }
}
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Cloudflare Turnstile widget. Renders nothing when no site key is configured. Call the returned token via onToken. */
export function Turnstile({ siteKey, onToken, resetKey = 0 }: { siteKey: string; onToken: (t: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let dead = false;
    const draw = () => {
      if (dead || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) draw();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (!s) { s = document.createElement("script"); s.src = SRC; s.async = true; document.head.appendChild(s); }
      s.addEventListener("load", draw);
    }
    return () => { dead = true; if (id.current && window.turnstile) window.turnstile.remove(id.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  useEffect(() => { if (resetKey && id.current && window.turnstile) { window.turnstile.reset(id.current); onToken(""); } }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
