// Colours for the install section's <script> tag, worked out at build time. Only a
// tokenizer for one HTML tag: the joined tokens are always exactly the input.

export type TokenKind = "tag" | "attr" | "value" | "hash" | "punct" | "space";

export interface Token {
  text: string;
  kind: TokenKind;
}

const NAME = /[A-Za-z][\w:-]*/y;
const SPACE = /\s+/y;
const ATTR = /[^\s="'<>/]+/y;
const SRI = /^(sha(?:256|384|512)-)(.+)$/;

export function highlightTag(input: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (last !== undefined && last.kind === kind && kind === "punct") last.text += text;
    else out.push({ text, kind });
  };
  const take = (re: RegExp, at: number): string | null => {
    re.lastIndex = at;
    return re.exec(input)?.[0] ?? null;
  };
  let i = 0;
  let inTag = false;
  let attr = "";
  while (i < input.length) {
    const c = input[i] ?? "";
    if (!inTag) {
      if (c === "<") {
        const close = input[i + 1] === "/";
        push(close ? "</" : "<", "punct");
        i += close ? 2 : 1;
        const name = take(NAME, i);
        if (name !== null) {
          push(name, "tag");
          i += name.length;
        }
        inTag = true;
      } else {
        push(c, "punct");
        i++;
      }
      continue;
    }
    const space = take(SPACE, i);
    if (space !== null) {
      push(space, "space");
      i += space.length;
    } else if (c === ">" || (c === "/" && input[i + 1] === ">")) {
      const end = c === ">" ? ">" : "/>";
      push(end, "punct");
      i += end.length;
      inTag = false;
    } else if (c === "=" && (input[i + 1] === '"' || input[i + 1] === "'")) {
      const quote = input[i + 1] ?? '"';
      push(`=${quote}`, "punct");
      const close = input.indexOf(quote, i + 2);
      const end = close < 0 ? input.length : close;
      const value = input.slice(i + 2, end);
      const sri = attr === "integrity" ? SRI.exec(value) : null;
      if (sri !== null) {
        push(sri[1] ?? "", "value");
        push(sri[2] ?? "", "hash");
      } else {
        push(value, "value");
      }
      if (close >= 0) push(quote, "punct");
      i = close < 0 ? input.length : close + 1;
    } else if (c === "=") {
      push("=", "punct");
      i++;
      const value = take(ATTR, i);
      if (value !== null) {
        push(value, "value");
        i += value.length;
      }
    } else {
      const name = take(ATTR, i);
      if (name !== null) {
        push(name, "attr");
        attr = name.toLowerCase();
        i += name.length;
      } else {
        push(c, "punct");
        i++;
      }
    }
  }
  return out;
}
