# Context breakdown pane

**Verdict: maybe.** It is cheap to build, but the built-in `/context` already shows the same data when you ask for it. The pane only adds value if it stays open and shows what changed since the last turn.

## What already exists
- The built-in `/context` command draws a grid and a table: system prompt, tools, MCP tools, memory files, skills, messages, free space. See [jdhodges.com: /context](https://www.jdhodges.com/blog/claude-code-context-slash-command-token-usage/) and [claudelog: what is /context](https://claudelog.com/faqs/what-is-context-command-in-claude-code).
- The mod API gives the same numbers: `$.session.usage({ breakdown: 'summary' })` returns `categories`, `gridRows`, `memoryFiles`, `mcpTools` (per server and per tool), `skills` and `autoCompactThreshold`. The `'summary'` mode is a free local estimate, while `'full'` calls the token-count API.
- Panes come from `$.ui.open({ id, title })` plus a `ui.render` hook on `Pane`. The plugin-authoring example `pane.tsx` is the template.

## Smallest useful version
1. Add a `/ctx` command to session-hud that opens a pane called "Context".
2. Draw the top 5 categories with tokens and %. Below them, list the 3 heaviest MCP servers and the 3 heaviest memory files.
3. Refresh after each turn using `breakdown: 'summary'`, and show the change since the last turn (for example "+12k messages").
4. Add one line of advice when something is heavy, for example "MCP server X costs 18k tokens. Disable it in this project?"

Size: about 3 to 4 hours, including tests.

## Risks and open questions
- A docked pane is only a sidebar in fullscreen mode. On the main screen it opens inline and takes space.
- `'full'` mode sends a token-count request per tool, so use `'summary'` for live refresh.
- Is this worth it with a 1M window, where you rarely run out?

## Next step
Run `/context` in a heavy session and check whether MCP tools or memory files take more than 10%. Build the pane only if they do.
