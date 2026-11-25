"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar, CHARACTERS, CHARACTER_BG, CharacterArt } from "@/components/avatar";
import { postJson } from "@/components/forms";
import { Alert, cn } from "@/components/ui";

type Initial = { nickname: string; avatar: string; has_photo: boolean; photo_consent: boolean };

/** Resize in the browser to 256x256 JPEG so uploads stay small and EXIF/location data is dropped. */
async function resize(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export function AvatarPicker({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [sel, setSel] = useState(initial.avatar);
  const [nick, setNick] = useState(initial.nickname);
  const [consent, setConsent] = useState(initial.photo_consent);
  const [photo, setPhoto] = useState<string | null>(null); // new upload (base64) not yet saved
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const hasPhoto = !!photo || initial.has_photo;

  async function pick(f?: File) {
    if (!f) return;
    try { setPhoto(await resize(f)); setSel("photo"); setMsg(null); }
    catch { setMsg({ tone: "error", text: "That image could not be read. Try another photo." }); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await postJson("/api/student/set_avatar", {
        avatar: sel, nickname: nick, photo_consent: consent,
        ...(photo ? { photo_b64: photo } : {}), ...(sel !== "photo" && !consent ? { remove_photo: true } : {}),
      });
      setPhoto(null);
      setMsg({ tone: "success", text: "Saved." });
      router.refresh();
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-col items-center gap-2">
        {sel === "photo" && photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`data:image/jpeg;base64,${photo}`} alt="New photo preview" className="h-28 w-28 rounded-full border-4 border-primary object-cover" />
          : <Avatar kind={sel} own size={112} className="border-4 border-primary" />}
        <p className="text-xl font-extrabold">{nick || "Your nickname"}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Pick your character</p>
        <div className="grid grid-cols-3 gap-3">
          {CHARACTERS.map((c) => (
            <button key={c} type="button" aria-label={`Choose ${c}`} aria-pressed={sel === c} onClick={() => setSel(c)}
              style={{ background: CHARACTER_BG[c] }}
              className={cn("grid aspect-square place-items-center rounded-2xl", sel === c && "ring-[3px] ring-primary")}>
              <CharacterArt kind={c} size={52} />
            </button>
          ))}
          <button type="button" aria-label="Use my photo" aria-pressed={sel === "photo"}
            onClick={() => (hasPhoto ? setSel("photo") : file.current?.click())}
            className={cn("grid aspect-square place-items-center rounded-2xl border border-slate-200 bg-white text-xs font-bold text-primary", sel === "photo" && "ring-[3px] ring-primary")}>
            {hasPhoto ? "My photo" : "Upload photo"}
          </button>
        </div>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Photo file"
          onChange={(e) => pick(e.target.files?.[0])} />
        {hasPhoto && <button type="button" className="mt-2 text-xs font-semibold text-primary underline" onClick={() => file.current?.click()}>Change photo</button>}
      </div>

      <div>
        <label htmlFor="nick" className="label">Nickname (the only name other students see)</label>
        <input id="nick" className="input" value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} />
      </div>

      <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        My parent or guardian agrees to my photo being stored in this app. My photo is visible only to me, never to other students.
      </label>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary w-full" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
    </section>
  );
}
