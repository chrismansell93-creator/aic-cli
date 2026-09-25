import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs } from "../src/args.ts";
import { createAppProject, isAppRequest, openApp, slugify } from "../src/appmode.ts";
import { appSystemPrompt } from "../src/prompt.ts";

test("18. app requests are recognized", () => {
  assert.equal(isAppRequest("make me a todo app"), true);
  assert.equal(isAppRequest("build a website for recipes"), true);
  assert.equal(isAppRequest("fix the failing test"), false);
  assert.equal(isAppRequest("i want the app to be blue"), false);
});

test("19. slugify drops filler words", () => {
  assert.equal(slugify("make me a counter app"), "counter");
  assert.equal(slugify("notes for school"), "notes-school");
});

test("20. createAppProject makes an empty unique folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-apps-"));
  const first = createAppProject("make me a counter app", root);
  fs.writeFileSync(path.join(first, "index.html"), "<html></html>");
  const second = createAppProject("counter", root);
  assert.equal(path.basename(first), "counter");
  assert.equal(path.basename(second), "counter-2");
  assert.equal(fs.readdirSync(second).length, 0);
  assert.equal(openApp(second), false);
});

test("21. parseArgs app subcommand", () => {
  const made = parseArgs(["app", "a", "counter"]);
  assert.equal(made.app, true);
  assert.equal(made.auto, true);
  assert.equal(made.repl, false);
  assert.equal(made.prompt, "a counter");
  const bare = parseArgs(["app"]);
  assert.equal(bare.app, true);
  assert.equal(bare.repl, true);
  assert.equal(bare.prompt, "");
});

test("22. app prompt requires a browser file", () => {
  const text = appSystemPrompt("/tmp/counter", "a counter", false);
  assert.match(text, /index\.html/);
  assert.match(text, /a counter/);
  assert.match(text, /No npm/);
});
