import { describe, expect, it } from "vitest";
import { youtubeEmbedSrc } from "../src/lib/youtube.ts";

describe("youtubeEmbedSrc", () => {
  it("builds a privacy-enhanced, autoplaying embed URL from a video ID", () => {
    expect(youtubeEmbedSrc("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1",
    );
  });

  it.each(["", "short", "has space in it", "javascript:alert(1)", "dQw4w9WgXcQ/../x"])(
    "rejects %j",
    (id) => {
      expect(youtubeEmbedSrc(id)).toBeNull();
    },
  );
});
