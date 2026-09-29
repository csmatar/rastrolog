// Runs in a Web Worker, so a 100 MB log never blocks the page. Nothing is sent
// anywhere: the file is read, parsed and summarised here, and only the report goes
// back to the page.
import { parseLogStream, parseLogText, UnknownFormatError } from "@rastrolog/core";
import type { LogJob, LogMessage } from "../lib/log-protocol.ts";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LogJob>) => void) | null;
  postMessage(message: LogMessage): void;
};

scope.onmessage = (event) => {
  void handle(event.data);
};

async function handle(job: LogJob): Promise<void> {
  const options = { format: job.format };
  try {
    const result =
      job.kind === "text"
        ? parseLogText(job.text, options)
        : await parseLogStream(job.file.stream(), {
            ...options,
            onProgress: (bytesRead) => scope.postMessage({ kind: "progress", bytesRead }),
          });
    scope.postMessage({ kind: "done", result });
  } catch (err) {
    if (err instanceof UnknownFormatError)
      scope.postMessage({ kind: "unknown-format", line: err.line.slice(0, 500) });
    else
      scope.postMessage({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
  }
}
