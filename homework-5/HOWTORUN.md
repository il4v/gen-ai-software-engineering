# HOWTORUN — Homework 5 (MCP Servers)

## Prerequisites

- [Claude Code](https://claude.com/product/claude-code) CLI installed and logged in.
- `gh` CLI authenticated (`gh auth login`) — the GitHub MCP server reuses this token via
  `gh auth token`.
- `docker` installed and running — the GitHub MCP server runs as a container.
- `uv` installed (https://docs.astral.sh/uv/) — used to run the custom MCP server with automatic
  dependency resolution.
- `node`/`npx` on PATH — used to run the Filesystem MCP server.
- A Jira Cloud account with edit access to a project containing at least 5 issues typed `Bug`.

## 1. Install dependencies

Nothing needs a manual `pip install` — every server is launched by `.mcp.json` with a command that
resolves its own dependencies at start:

- GitHub MCP: pulled automatically by `docker run` (`ghcr.io/github/github-mcp-server`).
- Filesystem MCP: pulled automatically by `npx` (`@modelcontextprotocol/server-filesystem`).
- Atlassian MCP: no install — it's a remote HTTP server.
- Custom MCP server: `uv run` reads the inline PEP 723 dependency block at the top of
  `custom-mcp-server/server.py` (`dependencies = ["fastmcp"]`) and installs it into an ephemeral,
  cached environment on first run. `custom-mcp-server/requirements.txt` also lists `fastmcp` explicitly
  for anyone who prefers a plain virtualenv:
  ```bash
  cd custom-mcp-server
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  ```

## 2. MCP configuration

All four servers are registered in [`.mcp.json`](.mcp.json) at **project scope**, so they load
automatically whenever Claude Code is opened in `homework-5/`:

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "sh",
      "args": ["-c", "docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN=\"$(gh auth token)\" ghcr.io/github/github-mcp-server stdio"]
    },
    "atlassian": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp"
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/absolute/path/to/homework-5"]
    },
    "lorem-ipsum": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "custom-mcp-server/server.py"]
    }
  }
}
```

No static secrets are committed: the GitHub token is fetched at server-start time via `gh auth token`,
and Atlassian auth happens through an OAuth browser flow on first use.

## 3. Run and connect

1. Open a terminal in `homework-5/` and start Claude Code: `claude`.
2. Claude Code reads `.mcp.json` and attempts to connect all four servers. Run `claude mcp list` at any
   time to check status — each should show `✔ Connected`.
3. **First-time OAuth**: the first GitHub MCP call and the first Atlassian MCP call each open a browser
   tab for login/consent. Log in with the account that has access to this repo (GitHub) or your Jira
   site (Atlassian), and click Allow.
4. **First-time custom server connect** can take longer than usual (`uv` downloading `fastmcp` and its
   dependencies for the first time) — if `claude mcp list` reports `lorem-ipsum` failed with a
   connection timeout, simply restart Claude Code once the `uv` package cache is warm; subsequent
   connects are fast.

## 4. Test each server

Ask Claude Code (in plain language — the tool names below are shown so you can identify them in the
tool-call output, not something you type):

| Server | Example prompt | Underlying tool |
|---|---|---|
| GitHub | "List the 5 most recent pull requests on this repo" | `mcp__github__list_pull_requests` |
| Filesystem | "List files in homework-5/" | `mcp__filesystem__list_directory` |
| Atlassian | "Give me the tickets of the last 5 bugs on project KAN." | `mcp__atlassian__searchJiraIssuesUsingJql` |
| Custom (lorem-ipsum) | "Call the read tool on the lorem-ipsum MCP server" | `mcp__lorem-ipsum__read` |

The custom server's `read` tool accepts an optional `word_count` (default `30`):

```
Call the lorem-ipsum read tool with word_count=10
```

Expected output for the default call (first 30 words of `custom-mcp-server/lorem-ipsum.md`):

```
# Lorem Ipsum Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
```

The same content is also reachable as a **Resource** at URI `lorem-ipsum://{word_count}` (e.g.
`lorem-ipsum://15`), for clients that read resources directly instead of calling a tool.

## 5. Local self-test (without Claude Code)

To verify the custom server directly, without going through Claude Code's MCP connection:

```bash
cd custom-mcp-server
uv run - <<'EOF'
import asyncio
from fastmcp import Client
import server

async def main():
    async with Client(server.mcp) as client:
        result = await client.call_tool("read", {"word_count": 10})
        print(result.data)

asyncio.run(main())
EOF
```

This should print the first 10 words of `lorem-ipsum.md`.

## 6. Running the demo app (Maze Runner)

`demo-game/` is not a graded homework-5 deliverable — it's the small app used to generate realistic
Jira bug tickets (`KAN-1`–`KAN-5`) for Task 3's Atlassian MCP query. It's committed to the repo, so run
instructions are included here for completeness.

- **Dependencies**: none. It's a single self-contained `index.html` (inline CSS/JS, no build step, no
  network calls).
- **Run it**:
  ```bash
  open demo-game/index.html        # macOS
  # or just double-click the file, or drag it into any browser
  ```
- **Use it**: pick a difficulty (Small/Medium/Large) from the dropdown, click "New Maze" to generate a
  layout, and navigate from the start cell to the exit with the arrow keys. Move count and elapsed time
  are tracked in the HUD and stop on reaching the goal.
- See `demo-game/MAZE-RUNNER-SPEC.md` for the full design spec (maze-generation algorithm, collision
  rules, etc.) if you want to understand the implementation rather than just run it.
