/**
 * The countdown is only a visual aid; the server decides what is accepted. It is anchored to the server clock so a
 * wrong device clock cannot distort it: offset = serverNow - clientNowAtFetch.
 */
export function clockOffsetMs(serverNowIso: string, clientNowAtFetchMs: number): number {
  return new Date(serverNowIso).getTime() - clientNowAtFetchMs;
}

export function remainingMs(deadlineIso: string, offsetMs: number, clientNowMs: number): number {
  return Math.max(0, new Date(deadlineIso).getTime() - (clientNowMs + offsetMs));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
