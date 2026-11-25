import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export const CHARACTERS = ["fox", "owl", "robot", "cat", "bear"] as const;
export type Character = (typeof CHARACTERS)[number];

const BG: Record<Character, string> = { fox: "#FFEDD5", owl: "#EDE9FE", robot: "#E0F2FE", cat: "#E2E8F0", bear: "#FEF3C7" };

const ART: Record<Character, ReactNode> = {
  fox: <><polygon points="10,8 26,22 12,30" fill="#EA580C" /><polygon points="54,8 38,22 52,30" fill="#EA580C" /><path d="M10 28 Q32 8 54 28 L46 50 Q32 60 18 50 Z" fill="#F97316" /><path d="M22 40 Q32 56 42 40 Q32 46 22 40Z" fill="#fff" /><circle cx="23" cy="33" r="3" fill="#0F172A" /><circle cx="41" cy="33" r="3" fill="#0F172A" /><circle cx="32" cy="44" r="3" fill="#0F172A" /></>,
  owl: <><ellipse cx="32" cy="36" rx="22" ry="24" fill="#7C3AED" /><polygon points="14,18 22,8 28,18" fill="#6D28D9" /><polygon points="50,18 42,8 36,18" fill="#6D28D9" /><circle cx="23" cy="30" r="9" fill="#fff" /><circle cx="41" cy="30" r="9" fill="#fff" /><circle cx="23" cy="30" r="4" fill="#0F172A" /><circle cx="41" cy="30" r="4" fill="#0F172A" /><polygon points="28,38 36,38 32,46" fill="#FBBF24" /></>,
  robot: <><line x1="32" y1="6" x2="32" y2="16" stroke="#475569" strokeWidth="3" /><circle cx="32" cy="6" r="4" fill="#EF4444" /><rect x="10" y="16" width="44" height="38" rx="10" fill="#0EA5E9" /><circle cx="23" cy="32" r="6" fill="#fff" /><circle cx="41" cy="32" r="6" fill="#fff" /><circle cx="23" cy="32" r="3" fill="#0F172A" /><circle cx="41" cy="32" r="3" fill="#0F172A" /><rect x="22" y="43" width="20" height="5" rx="2.5" fill="#fff" /></>,
  cat: <><polygon points="10,8 26,20 10,32" fill="#475569" /><polygon points="54,8 38,20 54,32" fill="#475569" /><circle cx="32" cy="36" r="22" fill="#64748B" /><circle cx="23" cy="33" r="3.5" fill="#FDE047" /><circle cx="41" cy="33" r="3.5" fill="#FDE047" /><polygon points="29,41 35,41 32,45" fill="#F472B6" /><path d="M8 40 H20 M8 46 H20 M44 40 H56 M44 46 H56" stroke="#fff" strokeWidth="2" /></>,
  bear: <><circle cx="14" cy="14" r="8" fill="#92400E" /><circle cx="50" cy="14" r="8" fill="#92400E" /><circle cx="32" cy="34" r="24" fill="#B45309" /><ellipse cx="32" cy="42" rx="11" ry="8" fill="#FDE68A" /><circle cx="23" cy="30" r="3" fill="#0F172A" /><circle cx="41" cy="30" r="3" fill="#0F172A" /><circle cx="32" cy="39" r="3" fill="#0F172A" /></>,
};

/** Character or (own) photo. Other students' photos are never available, so leaderboards only ever get characters. */
export function Avatar({ kind, size = 40, own = false, className }: { kind: string; size?: number; own?: boolean; className?: string }) {
  const style = { width: size, height: size };
  if (kind === "photo" && own) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/api/student-photo" alt="My photo" style={style} className={cn("shrink-0 rounded-full bg-slate-200 object-cover", className)} />;
  }
  const c: Character = (CHARACTERS as readonly string[]).includes(kind) ? (kind as Character) : "fox";
  return (
    <span style={{ ...style, background: BG[c] }} className={cn("inline-flex shrink-0 items-center justify-center rounded-full", className)}>
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 64 64" role="img" aria-label={`${c} character`}>{ART[c]}</svg>
    </span>
  );
}

export const CHARACTER_BG = BG;
export function CharacterArt({ kind, size }: { kind: Character; size: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>{ART[kind]}</svg>;
}
