"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ExternalLink, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseVideoLink, videoUrl, type VideoClip } from "@/lib/video";

interface SavedClip extends VideoClip { title: string; note: string }
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("film-updated", notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener("film-updated", notify); };
};

export function FilmRoom({ playerId, name }: { playerId: string; name: string }) {
  const key = `dynasty-film:${playerId}`;
  const raw = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  const clips = useMemo<SavedClip[]>(() => {
    try {
      const items: unknown = JSON.parse(raw ?? "[]");
      return Array.isArray(items) ? items.filter((c): c is SavedClip => c && typeof c.title === "string" && typeof c.note === "string" && typeof c.videoId === "string" && Number.isInteger(c.start) && !!parseVideoLink(videoUrl(c))).slice(0, 12) : [];
    } catch { return []; }
  }, [raw]);
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState("");
  function persist(next: SavedClip[]) {
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event("film-updated")); return true; }
    catch { setError("Browser storage is unavailable. Your clip was not saved."); return false; }
  }
  return <section id="film-room" aria-label="Film room" className="space-y-4 rounded-3xl bg-card p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Film room</h2>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="ghost"><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} football film highlights`)}`} target="_blank" rel="noreferrer">Find clips<ExternalLink /></a></Button>
        <Button size="sm" variant="outline" onClick={() => { setAdding(!adding); setError(""); }} aria-expanded={adding} disabled={clips.length >= 12}><Plus />Add clip</Button>
      </div>
    </div>
    {adding ? <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const clip = parseVideoLink(String(data.get("url")));
      if (!clip) { setError("Enter a valid YouTube video link, with an optional timestamp."); return; }
      if (clips.some(c => c.videoId === clip.videoId && c.start === clip.start)) { setError("This clip is already saved."); return; }
      if (clips.length >= 12) { setError("Remove a clip before adding another."); return; }
      if (persist([...clips, { ...clip, title: String(data.get("title")).trim() || `${name} film`, note: String(data.get("note")).trim() }])) { setAdding(false); setError(""); toast.success("Clip saved on this device"); }
    }}>
      <label className="grid gap-2 text-sm">YouTube link<Input name="url" type="url" required placeholder="https://youtu.be/…" maxLength={2000} /></label>
      <label className="grid gap-2 text-sm">Title<Input name="title" maxLength={100} placeholder={`${name} film`} /></label>
      <label className="grid gap-2 text-sm">Scouting note<Textarea name="note" maxLength={1000} rows={3} /></label>
      <div className="flex gap-2"><Button type="submit">Save clip</Button><Button type="button" variant="ghost" onClick={() => { setAdding(false); setError(""); }}>Cancel</Button></div>
    </form> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!clips.length && !adding ? <p className="text-sm text-muted-foreground">No clips saved on this device.</p> : null}
    <div className="grid gap-4 lg:grid-cols-2">
      {clips.map(clip => {
        const id = `${clip.videoId}:${clip.start}`;
        return <article key={id} className="min-w-0 overflow-hidden rounded-2xl border border-border">
          {active === id ? <iframe className="aspect-video min-h-[200px] w-full bg-black" src={`https://www.youtube-nocookie.com/embed/${clip.videoId}?start=${clip.start}&playsinline=1`} title={clip.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <button type="button" className="flex min-h-32 w-full items-center justify-center gap-2 bg-muted text-foreground transition-colors hover:bg-accent" onClick={() => setActive(id)} aria-label={`Play ${clip.title}`}><Play className="size-5" />Watch clip{clip.start > 0 ? ` · ${Math.floor(clip.start / 60)}:${String(clip.start % 60).padStart(2, "0")}` : ""}</button>}
          <div className="space-y-3 p-4">
            <h3 className="break-words font-medium">{clip.title}</h3>
            {clip.note ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{clip.note}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <a href={videoUrl(clip)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4">Open on YouTube<ExternalLink className="size-3.5" /></a>
              <Button size="icon" variant="ghost" aria-label={`Remove ${clip.title}`} onClick={() => { if (persist(clips.filter(c => c !== clip))) { if (active === id) setActive(null); toast.success("Clip removed"); } }}><Trash2 /></Button>
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
