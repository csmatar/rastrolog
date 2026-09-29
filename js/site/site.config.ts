// Build-time settings. Values that differ per deploy come from the environment
// (the deploy plan sets them); everything here ends up in public HTML, so none of
// it is secret. RASTROLOG_SITE_RELEASE=1 turns a missing value into an error.

export interface Article {
  title: string;
  url: string;
}

export interface SiteConfig {
  siteUrl: string;
  kit: { general: string; latam: string };
  articles: readonly Article[];
  youtubeId: string | null;
}

// The "Articles and video" section stays hidden until these are filled in.
export const ARTICLES: readonly Article[] = [];
export const YOUTUBE_ID: string | null = null;

const DEV = {
  siteUrl: "http://localhost:4321",
  kitGeneral: "test-general",
  kitLatam: "test-latam",
};

export function resolveConfig(env: Readonly<Record<string, string | undefined>>): SiteConfig {
  const release = env.RASTROLOG_SITE_RELEASE === "1";
  const pick = (name: string, fallback: string): string => {
    const value = env[name]?.trim() ?? "";
    if (value !== "") return value;
    if (release) throw new Error(`${name} must be set for a release build`);
    return fallback;
  };
  const rawUrl = pick("SITE_URL", DEV.siteUrl);
  let siteUrl: string;
  try {
    siteUrl = new URL(rawUrl).origin;
  } catch {
    throw new Error(`SITE_URL is not a URL: ${rawUrl}`);
  }
  return {
    siteUrl,
    kit: {
      general: pick("KIT_FORM_GENERAL", DEV.kitGeneral),
      latam: pick("KIT_FORM_LATAM", DEV.kitLatam),
    },
    articles: ARTICLES,
    youtubeId: YOUTUBE_ID,
  };
}

export const siteConfig: SiteConfig = resolveConfig(process.env);
