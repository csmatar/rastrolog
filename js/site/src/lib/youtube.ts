// The spec's click-to-load video: nothing loads from YouTube until the visitor clicks.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeEmbedSrc(id: string): string | null {
  return VIDEO_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
}
