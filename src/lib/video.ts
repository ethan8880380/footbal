export interface VideoClip { videoId: string; start: number }

/** Accept video links only; never embed user-supplied HTML or arbitrary hosts. */
export function parseVideoLink(input: string): VideoClip | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, "");
    let videoId: string | null = null;
    if (host === "youtu.be") videoId = url.pathname.slice(1);
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      videoId = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1] ?? null;
    }
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
    const time = url.searchParams.get("t") ?? url.searchParams.get("start") ?? "0";
    const units = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const start = /^\d+$/.test(time) ? Number(time) : units ? Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0) : NaN;
    if (!Number.isSafeInteger(start) || start < 0 || start > 86400) return null;
    return { videoId, start };
  } catch { return null; }
}

export function videoUrl(clip: VideoClip) {
  return `https://www.youtube.com/watch?v=${clip.videoId}&t=${clip.start}`;
}
