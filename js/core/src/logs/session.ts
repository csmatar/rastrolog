// Port of python/src/rastrolog/parse.py's loop: universal newlines, blank lines,
// detection on the first non-blank line, malformed lines counted as skipped.
import { MalformedLineError } from "./errors.js";
import { detect, type Format, type LineParser, makeParser } from "./formats.js";
import { pyStrip } from "./pytext.js";
import { Aggregator, type Report } from "./report.js";

export interface ParseOptions {
  /** Skip detection (the user picked a format after an unknown-format error). */
  format?: Format | undefined;
  ownHost?: string | null | undefined;
  top?: number | undefined;
}

export interface ParseResult {
  report: Report;
  format: Format | null;
  lines: number;
  records: number;
  skipped: number;
  truncated: boolean;
}

/** Splits text into lines at \r\n, \r or \n, across chunk boundaries. */
export class LineSplitter {
  private buffer = "";
  private skipLf = false;

  push(chunk: string, emit: (line: string) => void): void {
    let text = chunk;
    if (this.skipLf) {
      this.skipLf = false;
      if (text.startsWith("\n")) text = text.slice(1);
    }
    const data = this.buffer + text;
    let start = 0;
    for (let i = 0; i < data.length; i++) {
      const c = data.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      emit(data.slice(start, i));
      if (c === 13) {
        if (i + 1 < data.length) {
          if (data.charCodeAt(i + 1) === 10) i++;
        } else {
          this.skipLf = true; // a "\n" at the start of the next chunk belongs to this "\r"
        }
      }
      start = i + 1;
    }
    this.buffer = data.slice(start);
  }

  end(emit: (line: string) => void): void {
    if (this.buffer !== "") emit(this.buffer);
    this.buffer = "";
  }
}

export class LogSession {
  lines = 0;
  records = 0;
  skipped = 0;
  truncated = false;
  format: Format | null = null;
  private parser: LineParser | null = null;
  private readonly aggregator: Aggregator;
  private readonly options: ParseOptions;

  constructor(options: ParseOptions = {}) {
    this.options = options;
    this.aggregator = new Aggregator({ ownHost: options.ownHost });
  }

  /** One line without its terminator. Throws UnknownFormatError on an unknown first line. */
  consume(line: string): void {
    this.lines++;
    if (pyStrip(line) === "") return;
    if (this.parser === null) {
      this.format = this.options.format ?? detect(line);
      this.parser = makeParser(this.format);
    }
    let record: ReturnType<LineParser["parse"]>;
    try {
      record = this.parser.parse(line);
    } catch (err) {
      if (err instanceof MalformedLineError) {
        this.skipped++;
        return;
      }
      throw err;
    }
    if (record !== null) {
      this.records++;
      this.aggregator.add(record);
    }
  }

  result(): ParseResult {
    return {
      report: this.aggregator.result({ top: this.options.top, skipped: this.skipped }),
      format: this.format,
      lines: this.lines,
      records: this.records,
      skipped: this.skipped,
      truncated: this.truncated,
    };
  }
}

/** Parse pasted text. */
export function parseLogText(text: string, options: ParseOptions = {}): ParseResult {
  const session = new LogSession(options);
  const splitter = new LineSplitter();
  const emit = (line: string) => session.consume(line);
  splitter.push(text, emit);
  splitter.end(emit);
  return session.result();
}
