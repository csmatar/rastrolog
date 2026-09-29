// Messages between logs.ts (the page) and log-worker.ts (the Web Worker).
import type { Format, ParseResult } from "@rastrolog/core";

export type LogJob =
  | { kind: "file"; file: File; format?: Format | undefined }
  | { kind: "text"; text: string; format?: Format | undefined };

export type LogMessage =
  | { kind: "progress"; bytesRead: number }
  | { kind: "done"; result: ParseResult }
  | { kind: "unknown-format"; line: string }
  | { kind: "error"; message: string };
