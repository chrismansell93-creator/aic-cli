import fs from "node:fs";
import path from "node:path";

export function resolveCwd(input: string | undefined, fallback = process.cwd()): string {
  const resolved = path.resolve(fallback, input ?? ".");
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Working directory does not exist: ${resolved}`);
  }
  return resolved;
}

/** Resolve `input` inside `cwd`. Rejects path traversal. */
export function resolveWithinCwd(cwd: string, input: string): string {
  if (!input || !input.trim()) throw new Error("Path is required");
  const root = path.resolve(cwd);
  const target = path.resolve(root, input);
  const rel = path.relative(root, target);
  if (rel === "..") throw new Error(`Path escapes workspace: ${input}`);
  if (rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${input}`);
  }
  return target;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
