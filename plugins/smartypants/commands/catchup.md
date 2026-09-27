---
description: Build the Smartypants diagram from the existing code and infrastructure, in the background.
allowed-tools: Bash(npx smartypants catchup:*)
---

Run `npx smartypants catchup` in the project root. It maps the code (services, dependencies, routes, tables, topics) and the infrastructure (docker compose, Kubernetes, Helm, Terraform, and their network boundaries), reads each code unit, and draws the baseline diagram in the background. Tell the user it is running and that progress shows on the canvas (`/smartypants:diagram`). If you cannot run commands here, give the user that command. Do not edit files.
