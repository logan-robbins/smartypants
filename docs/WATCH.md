# Watching another agent


To diagram a separate Claude Code or Codex instance, add `watch` with that instance's home:

```json
{ "flavor": "claude", "depth": "auto", "watch": { "host": "claude", "home": "/absolute/path/to/claude-home" } }
```

Use `"host": "codex"` for Codex, or `"session": "/absolute/session.jsonl"` for one session.
The canvas server follows new user turns; offsets (never text) go in
`.smartypants/watch-state.json`. The watched instance needs no hook.

## Watching an hx Partner

The hx Partner has a Claude home at `<hx-instance>/run/partner/home`. Point the
working project's Smartypants config at that directory:

```json
{
  "flavor": "claude",
  "depth": "auto",
  "seed": false,
  "watch": {"host":"claude","home":"/absolute/path/to/hx-instance/run/partner/home"}
}
```

Restart the Smartypants server after editing the config. Tell the Partner the project
path so it records the default work location. Tmux prompts and hx UI chat messages
appear in the Partner transcript and reach the project diagram. Verify the Partner
session has `main` and `companion` windows, both UI URLs respond, and the Smartypants
server reports the watched home. A greeting can be observed while leaving the canvas
empty because it provides no design information. Keep the hx instance outside the
project when practical so a future `--seed` scan does not include harness files.

