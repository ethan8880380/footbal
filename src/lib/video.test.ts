import { describe, expect, it } from "vitest";
import { parseVideoLink } from "./video";

describe("video links", () => {
  it("normalizes watch, short and shared timestamp links", () => {
    for (const url of ["https://youtu.be/M7lc1UVf-VE?t=1m30s", "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90", "https://youtube.com/shorts/M7lc1UVf-VE?start=90"]) {
      expect(parseVideoLink(url)).toEqual({ videoId: "M7lc1UVf-VE", start: 90 });
    }
  });
  it("rejects arbitrary embeds, spoofed hosts, credentials and invalid timestamps", () => {
    for (const url of ["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE", "https://evil.test/embed/M7lc1UVf-VE", "https://user@youtube.com/watch?v=M7lc1UVf-VE", "https://youtu.be/M7lc1UVf-VE?t=-1", "https://youtu.be/M7lc1UVf-VE?t=1000000000", "https://youtu.be/invalid"]) expect(parseVideoLink(url)).toBeNull();
  });
});
