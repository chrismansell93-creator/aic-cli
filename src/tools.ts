import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveWithinCwd, toPosix } from "./paths.js";

const execAsync = promisify(exec);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file. Optional 1-based offset/limit for line windows.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the workspace" },
          offset: { type: "integer", description: "1-based start line" },
          limit: { type: "integer", description: "Maximum lines to return" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file. Creates parent directories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace exactly one occurrence of old_string with new_string in an existing file. Include enough context to make old_string unique.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at a path (non-recursive).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory relative to the workspace. Default: ." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files by glob (e.g. **/*.ts, src/**/*.json). Ignores node_modules and .git.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents with a JavaScript regular expression.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string", description: "File or directory to search. Default: ." },
          glob: { type: "string", description: "Optional filename glob filter" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run a shell command in the workspace. Prefer this for tests, git, and builds — not for reading files.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
] as const;

export class ToolHost {
  constructor(
    readonly cwd: string,
    readonly dryRun: boolean,
  ) {}

  async execute(name: string, rawArgs: string): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return `Invalid JSON arguments: ${rawArgs}`;
    }
    try {
      return await this.dispatch(name, args);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "read_file":
        return this.readFile(str(args.path), num(args.offset), num(args.limit));
      case "write_file":
        return this.writeFile(str(args.path), str(args.content, true));
      case "edit_file":
        return this.editFile(str(args.path), str(args.old_string, true), str(args.new_string, true));
      case "list_dir":
        return this.listDir(str(args.path) || ".");
      case "glob":
        return this.glob(str(args.pattern));
      case "grep":
        return this.grep(str(args.pattern), str(args.path) || ".", str(args.glob) || undefined);
      case "bash":
        return this.bash(str(args.command));
      default:
        return `Unknown tool: ${name}`;
    }
  }

  readFile(rel: string, offset?: number, limit?: number): string {
    const abs = resolveWithinCwd(this.cwd, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`File not found: ${rel}`);
    }
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) throw new Error(`Refusing to read binary file: ${rel}`);
    const text = buf.toString("utf8");
    const lines = text.split("\n");
    const start = Math.max(1, offset ?? 1);
    const count = limit ?? lines.length;
    const slice = lines.slice(start - 1, start - 1 + count);
    const numbered = slice.map((line, i) => `${String(start + i).padStart(4, " ")}|${line}`);
    return numbered.join("\n") || "(empty)";
  }

  writeFile(rel: string, content: string): string {
    const abs = resolveWithinCwd(this.cwd, rel);
    if (this.dryRun) return `DRY RUN: would write ${rel} (${content.length} bytes)`;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    return `Wrote ${rel} (${content.length} bytes)`;
  }

  editFile(rel: string, oldString: string, newString: string): string {
    const abs = resolveWithinCwd(this.cwd, rel);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${rel}`);
    const text = fs.readFileSync(abs, "utf8");
    const matches = text.split(oldString).length - 1;
    if (matches === 0) throw new Error(`old_string not found in ${rel}`);
    if (matches > 1) {
      throw new Error(`old_string matched ${matches} times in ${rel}; include more context`);
    }
    if (this.dryRun) return `DRY RUN: would edit ${rel} (1 replacement)`;
    fs.writeFileSync(abs, text.replace(oldString, newString), "utf8");
    return `Edited ${rel}`;
  }

  listDir(rel: string): string {
    const abs = resolveWithinCwd(this.cwd, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`Directory not found: ${rel}`);
    }
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    if (entries.length === 0) return "(empty)";
    return entries
      .map((e) => `${e.isDirectory() ? "dir " : "file"} ${e.name}`)
      .sort()
      .join("\n");
  }

  glob(pattern: string): string {
    if (!pattern) throw new Error("pattern is required");
    const hits = walkFiles(this.cwd)
      .map((abs) => toPosix(path.relative(this.cwd, abs)))
      .filter((rel) => matchGlob(rel, pattern))
      .sort();
    if (hits.length === 0) return "No files matched.";
    const cap = 200;
    const extra = hits.length > cap ? `\n… ${hits.length - cap} more` : "";
    return hits.slice(0, cap).join("\n") + extra;
  }

  grep(pattern: string, rel: string, globFilter?: string): string {
    const re = new RegExp(pattern);
    const abs = resolveWithinCwd(this.cwd, rel);
    const files = fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? [abs]
      : walkFiles(abs);
    const out: string[] = [];
    for (const file of files) {
      const relFile = toPosix(path.relative(this.cwd, file));
      if (globFilter && !matchGlob(relFile, globFilter) && !matchGlob(path.basename(file), globFilter)) {
        continue;
      }
      let text: string;
      try {
        const buf = fs.readFileSync(file);
        if (buf.includes(0)) continue;
        text = buf.toString("utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i]!)) continue;
        out.push(`${relFile}:${i + 1}:${lines[i]}`);
        if (out.length >= 50) return out.join("\n") + "\n… truncated";
      }
    }
    return out.length ? out.join("\n") : "No matches.";
  }

  async bash(command: string): Promise<string> {
    if (!command.trim()) throw new Error("command is required");
    if (this.dryRun) return `DRY RUN: would run \`${command}\``;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.cwd,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        env: process.env,
      });
      return clip(`${stdout}${stderr ? (stdout ? "\n" : "") + stderr : ""}`.trim() || "(no output)");
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
      const body = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n");
      return clip(`Command failed (exit ${e.code ?? 1}):\n${body}`);
    }
  }
}

export function matchGlob(relPath: string, pattern: string): boolean {
  const norm = relPath.replaceAll("\\", "/");
  const pat = pattern.replaceAll("\\", "/");
  if (globToRegExp(pat).test(norm)) return true;
  if (!pat.includes("/")) {
    if (globToRegExp(pat).test(path.posix.basename(norm))) return true;
    if (globToRegExp(`**/${pat}`).test(norm)) return true;
  }
  return false;
}

export function globToRegExp(pattern: string): RegExp {
  let i = 0;
  let out = "^";
  while (i < pattern.length) {
    if (pattern.startsWith("**/", i)) {
      out += "(?:.*/)?";
      i += 3;
      continue;
    }
    if (pattern.startsWith("**", i) && (i + 2 === pattern.length || pattern[i + 2] === "/")) {
      out += ".*";
      i += 2;
      continue;
    }
    const c = pattern[i]!;
    if (c === "*") {
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if ("+()^$[]{}|.\\".includes(c)) out += `\\${c}`;
    else out += c;
    i += 1;
  }
  out += "$";
  return new RegExp(out);
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function str(v: unknown, allowEmpty = false): string {
  if (typeof v === "string") return v;
  if (v == null) return allowEmpty ? "" : "";
  return String(v);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function clip(s: string, max = 80_000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… truncated (${s.length - max} more chars)`;
}
