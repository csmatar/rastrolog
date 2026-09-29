/** A line in a known format that could not be parsed (counted as skipped). */
export class MalformedLineError extends Error {
  constructor(line: string) {
    super(`malformed line: ${line.slice(0, 300)}`);
    this.name = "MalformedLineError";
  }
}

/** The first non-blank line matched no supported format. */
export class UnknownFormatError extends Error {
  readonly line: string;
  constructor(line: string) {
    super(`unrecognised log format; first line was: ${line.slice(0, 300)}`);
    this.name = "UnknownFormatError";
    this.line = line;
  }
}
