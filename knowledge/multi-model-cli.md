# Calling Codex and Antigravity (agy) from Claude Code

How to get one-shot answers from Codex and agy inside a Claude Code session, and what to watch for.

Verified 2026-10-13 (codex-cli 0.155.1, agy 1.3.4).

## Commands

- Both at once, isolated, in parallel: `~/claude-kit/scripts/ask-models.sh PROMPT.md OUT_DIR`
- Codex, one-shot: `codex exec --ephemeral --skip-git-repo-check -s read-only -o OUT.md - < PROMPT.md`
- agy, one-shot: `agy -p "$(cat PROMPT.md)" --print-timeout 9m > OUT.md`
  - Always set `--print-timeout`; the default waits forever.
  - agy may write files into its cwd even when told to only print. Check the cwd for output.

## Practices

- For independent drafts: run each model in its own empty directory and put all input text inside the prompt. Then it cannot read the other drafts.
- Both take 2-4 minutes on a 15-40 KB prompt. Run them in the background, in parallel.
- Fact discipline differs by model. In the interview-prep run, the Gemini draft added details that were not in the source (for example a latency number) and its own review missed them; the Codex audit caught them. Always run a fact audit against the source record.

## Gotchas

- `gemini` CLI is deprecated (Homebrew disables it 2026-12-18). Use `agy`.
- If `which agy` finds nothing in a Claude Code shell, run `hash -r` or call `~/.local/bin/agy` directly.
- antigravity plugin 0.1.0: `/antigravity:status` prints nothing and `/antigravity:setup` does not exist. Workaround: `node <plugin>/bin/antigravity.mjs <command>`. Issue not filed yet.
