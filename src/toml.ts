/** Minimal TOML parser for flat string / number / boolean keys. */
export function parseToml(source: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (line.startsWith("[")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) throw new Error(`Invalid TOML line: ${raw}`);
    const key = line.slice(0, eq).trim();
    const value = parseValue(line.slice(eq + 1).trim());
    out[key] = value;
  }
  return out;
}

function stripComment(line: string): string {
  let inStr = false;
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inStr) {
      if (ch === "\\" && quote !== "'") {
        i += 1;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    }
  }
  return line;
}

function parseValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return "";
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return unquote(raw);
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function unquote(raw: string): string {
  const q = raw[0];
  let s = raw.slice(1, -1);
  if (q === "'") return s;
  s = s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return s;
}
