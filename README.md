# aic

Agentic coding CLI. Give it a task in a repo; it reads, searches, edits, and runs commands through any OpenAI-compatible API.

```
aic "explain this repo"
aic auto "write a debounce helper"
aic "fix the failing test"
aic --dry-run "refactor the parser"
aic                  # REPL
```

## Install

```bash
unzip aic-coding-cli.zip -d aic
cd aic
npm install && npm run build
export OPENAI_API_KEY=sk-...
# optional: OPENAI_BASE_URL / OPENAI_MODEL
node dist/cli.js "explain this repo"
# or: npm link && aic "fix the failing test"
```

Requires Node 18+.

## Usage

```
aic [options] [prompt...]
aic auto [prompt...]

  auto / --auto        Write the code immediately
  --dry-run            Plan only: no writes, no shell
  --cwd <dir>          Working directory (default: current)
  --model <name>       Model override
  --base-url <url>     OpenAI-compatible API base URL
  --max-steps <n>      Max tool rounds (default: 32)
  -h, --help
  -v, --version
```

## Config

Priority: **CLI flags > environment > `~/.config/aic/config.toml` > defaults**.

Environment:

| Variable | Meaning |
| --- | --- |
| `OPENAI_API_KEY` | API key (required) |
| `OPENAI_BASE_URL` | Default `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Default `gpt-4o` |

`~/.config/aic/config.toml`:

```toml
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
api_key = "sk-..."
max_steps = 32
```

Point `OPENAI_BASE_URL` at any compatible server (OpenAI, Azure, Groq, Ollama, xAI, local vLLM).

## What it can do

The model gets a tight tool loop:

| Tool | Purpose |
| --- | --- |
| `read_file` | Read a text file (optional line window) |
| `write_file` | Create / overwrite |
| `edit_file` | Unique search-and-replace |
| `list_dir` | List a directory |
| `glob` | Find files by pattern |
| `grep` | Regex search |
| `bash` | Run a command in `--cwd` |

File tools are sandboxed to the working directory. `--dry-run` still reads and searches, but write / edit / bash return a preview instead of executing.

## Develop

```bash
npm install
npm test
npm run build
```
