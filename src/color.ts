const enabled = process.stderr.isTTY && !process.env.NO_COLOR;

function wrap(code: string, s: string): string {
  return enabled ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const dim = (s: string) => wrap("2", s);
export const bold = (s: string) => wrap("1", s);
export const accent = (s: string) => wrap("36", s);
export const ok = (s: string) => wrap("32", s);
export const warn = (s: string) => wrap("33", s);
export const err = (s: string) => wrap("31", s);
