# Homework 5 — MCP Servers

**Author:** Illia Chantsov

## What this is

Four working Model Context Protocol (MCP) integrations with Claude Code, each proven with a live tool
call and a screenshot:

1. **GitHub MCP** — official `ghcr.io/github/github-mcp-server`, run via Docker, authenticated with a
   `gh auth token` short-lived token (no static PAT stored in config).
2. **Filesystem MCP** — `@modelcontextprotocol/server-filesystem`, scoped to this `homework-5/` directory.
3. **Atlassian (Jira) MCP** — Atlassian's official remote MCP server (`https://mcp.atlassian.com/v1/mcp`),
   OAuth in the browser, used against a real Jira project (`KAN`) with 5 seeded bug tickets.
4. **Custom FastMCP server** (`custom-mcp-server/`) — a from-scratch MCP server exposing a **Resource**
   (`lorem-ipsum://{word_count}`) and a **Tool** (`read`) that both return a word-limited slice of
   `lorem-ipsum.md`.

All four servers are registered in [`.mcp.json`](.mcp.json) at project scope.

Also included: `demo-game/` — a small self-contained Maze Runner browser game (no build step, no
dependencies), committed as the stand-in project used to generate the 5 realistic Jira bug tickets
(`KAN-1`–`KAN-5`) queried in Task 3. It is not itself a graded deliverable; see
[`demo-game/MAZE-RUNNER-SPEC.md`](demo-game/MAZE-RUNNER-SPEC.md) for its design and
[`HOWTORUN.md`](HOWTORUN.md) §6 for how to run it.

## Why these choices

- **Jira over Notion**: an existing Jira Cloud account (`illia4v.atlassian.net`) was already available, so
  no new account setup was required.
- **Atlassian's official remote MCP server over a token-based Jira MCP**: OAuth in the browser means no
  static API token has to be generated, stored, or accidentally committed — the remote server handles auth
  itself.
- **GitHub MCP via Docker + `gh auth token`**: reuses the already-authenticated `gh` CLI session instead of
  a separate hardcoded `GITHUB_PERSONAL_ACCESS_TOKEN` in `.mcp.json`; the token is fetched fresh at server
  start via a shell subcommand rather than being embedded in the committed config.
- **Custom server via `uv run` with inline PEP 723 script metadata**: `server.py` declares its own
  `fastmcp` dependency inline, so `uv run custom-mcp-server/server.py` resolves and installs dependencies
  on demand — reproducible for a reviewer without a manually-created virtualenv being part of the repo.

## Resources vs. Tools (Task 4)

- **Resources** are URIs that Claude (or any MCP client) can *read* — similar to a file or API response.
  The custom server's resource, `lorem-ipsum://{word_count}`, is addressed like a URI and returns content
  when read, with no side effects.
- **Tools** are actions Claude can *call* — they take structured input and perform an operation. The custom
  server's `read` tool takes an optional `word_count` argument and performs the same word-count-limited
  read as the resource, but as an explicit, callable action with a name and description an LLM can invoke
  autonomously.

## Deliverables map

| Deliverable | Location |
|---|---|
| MCP configuration | [`.mcp.json`](.mcp.json) |
| Custom MCP server | [`custom-mcp-server/server.py`](custom-mcp-server/server.py) |
| Dependencies | [`custom-mcp-server/requirements.txt`](custom-mcp-server/requirements.txt) |
| Lorem ipsum source | [`custom-mcp-server/lorem-ipsum.md`](custom-mcp-server/lorem-ipsum.md) |
| Screenshots | [`docs/screenshots/`](docs/screenshots/) |
| Run instructions | [`HOWTORUN.md`](HOWTORUN.md) |

See [`HOWTORUN.md`](HOWTORUN.md) for install/run/connect/test steps.
