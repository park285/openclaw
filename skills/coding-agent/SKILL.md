---
name: coding-agent
description: Run Codex CLI, Claude Code, OpenCode, or Pi Coding Agent via background process for programmatic control.
metadata:
  {
    "openclaw": { "emoji": "🧩", "requires": { "anyBins": ["claude", "codex", "opencode", "pi"] } },
  }
---

# Coding Agent

## PTY Mode (REQUIRED)

Coding agents are **interactive terminal applications**. Without `pty:true`, you'll get broken output or hangs.

**Always use `pty:true` when running coding agents:**

```bash
# ✅ Correct
bash pty:true command:"codex exec 'Your prompt'"

# ❌ Wrong - agent may break
bash command:"codex exec 'Your prompt'"
```

---

## Quick Reference

### Agents

| Agent | Command | Notes |
|-------|---------|-------|
| Codex CLI | `codex exec "prompt"` | Default model: `gpt-5.2-codex`. **Needs git repo** (use `mktemp -d && git init` for scratch). Flags: `--full-auto` (sandboxed auto-approve), `--yolo` (no sandbox/approval) |
| Claude Code | `claude "task"` | |
| OpenCode | `opencode run "task"` | |
| Pi | `pi "task"` | `-p` for non-interactive. Prompt caching enabled (PR #584, Jan 2026) |

### Bash Tool Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string | Shell command to run |
| `pty` | boolean | **REQUIRED for agents!** Allocates pseudo-terminal |
| `workdir` | string | Working directory (focuses agent context) |
| `background` | boolean | Run in background (returns sessionId) |
| `timeout` | number | Timeout in seconds |
| `elevated` | boolean | Run on host instead of sandbox |

### Process Actions

| Action | Description |
|--------|-------------|
| `list` | List all running/recent sessions |
| `poll` | Check if session is running (requires sessionId) |
| `log` | Get output (sessionId, optional since/limit) |
| `write` | Send raw data to stdin (sessionId, text) |
| `submit` | Send data + newline (sessionId, data) |
| `send-keys` | Send key tokens/hex bytes (sessionId, keys) |
| `paste` | Paste text, optional bracketed mode (sessionId, text) |
| `kill` | Terminate session (sessionId, optional signal) |

---

## Common Patterns

### One-Shot Task

```bash
# Quick chat (Codex needs git repo)
SCRATCH=$(mktemp -d) && cd $SCRATCH && git init && codex exec "Your prompt"

# Or in real project
bash pty:true workdir:~/project command:"codex exec 'Add error handling to API calls'"
```

### Background Mode

```bash
# Start agent
bash pty:true workdir:~/project background:true command:"codex --full-auto 'Build snake game'"

# Monitor progress
process action:log sessionId:XXX

# Send input
process action:submit sessionId:XXX data:"yes"

# Kill if needed
process action:kill sessionId:XXX
```

**Why workdir matters:** Agent wakes up in focused directory, doesn't wander off reading unrelated files.

---

## Safety Rules

- **Always use `pty:true`** - coding agents need a terminal!
- **Respect tool choice** - if user asks for Codex, use Codex. Don't silently take over if agent fails.
- **Be patient** - don't kill sessions because they're "slow"
- **Monitor with `process action:log`** - check progress without interfering
- **NEVER start Codex in `~/clawd/`** - it'll read soul docs and get weird ideas!
- **NEVER checkout branches in `~/Projects/openclaw/`** - that's the LIVE instance!
- Use `mktemp` for scratch work
- Respect tool choice (no silent takeover)

---

## Progress Updates

When spawning agents in background, keep user in the loop:

- Send **1 short message** when you start (what's running + where)
- Only update when **something changes**:
  - Milestone completes (build finished, tests passed)
  - Agent asks a question / needs input
  - Error or need user action
  - Agent finishes (include what changed + where)
- If you kill a session, **immediately say you killed it and why**

---

## Auto-Notify on Completion

For long-running tasks, append a wake trigger so OpenClaw gets notified immediately:

```bash
bash pty:true workdir:~/project background:true command:"codex --yolo exec 'Build a REST API for todos.

When completely finished, run: openclaw gateway wake --text \"Done: Built todos REST API with CRUD endpoints\" --mode now'"
```

This triggers an immediate wake event — Skippy gets pinged in seconds, not 10 minutes.
