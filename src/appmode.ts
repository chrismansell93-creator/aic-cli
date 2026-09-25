import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SKIP = new Set([
  "a",
  "an",
  "the",
  "me",
  "my",
  "app",
  "application",
  "please",
  "make",
  "build",
  "create",
  "scaffold",
  "for",
  "to",
  "with",
]);

/** True when the user is asking for a new app, not a change to the current one. */
export function isAppRequest(line: string): boolean {
  const text = line.trim();
  if (/^app\b/i.test(text)) return true;
  return /\b(make|build|create|scaffold)\b(?:\s+\w+){0,6}\s+(?:me\s+)?(?:an?\s+)?(?:new\s+)?(?:web\s+)?(?:app|application|website|site|game)\b/i.test(
    text,
  );
}

export function slugify(description: string): string {
  const words = description
    .replace(/^app\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !SKIP.has(word))
    .slice(0, 4);
  return words.join("-") || "app";
}

export function appsRoot(): string {
  const fromEnv = process.env.AIC_APPS_DIR?.trim();
  return fromEnv || path.join(os.homedir(), "apps");
}

/** Create an empty directory for a new app. Never reuses a non-empty folder. */
export function createAppProject(description: string, root: string): string {
  fs.mkdirSync(root, { recursive: true });
  const base = slugify(description);
  let dir = path.join(root, base);
  let n = 2;
  while (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    dir = path.join(root, `${base}-${n}`);
    n += 1;
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Open index.html when the app has one. Returns false if there is nothing to open. */
export function openApp(dir: string): boolean {
  const index = path.join(dir, "index.html");
  if (!fs.existsSync(index)) return false;
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", index], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [index], { detached: true, stdio: "ignore" }).unref();
  return true;
}
