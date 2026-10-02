---
description: Clear the Smartypants diagram and its intent memory so the next design turn draws it again.
argument-hint: ""
allowed-tools: Bash(npx smartypants reset)
---

Run `npx smartypants reset` in the project root. That deletes `.smartypants/design.json`, `.smartypants/intent.json`, and the stats. Leave `smartypants.config.json`. Do not ask for confirmation. Tell the user the graph is empty and the next design turn draws it again.
