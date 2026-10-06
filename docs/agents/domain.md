# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo is a single Electron application package (no `pnpm-workspace.yaml`, no `workspaces` field, no `packages/*`). One glossary and one ADR directory at the root:

```
/
├── GLOSSARY.md          ← does not exist yet
├── docs/adr/            ← does not exist yet
└── src/
```

Both are created lazily by `/domain-modeling` when terms or decisions actually get resolved — not upfront.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, if it exists.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

`AGENTS.md` is the authoritative existing convention document for this repo (architecture constraints, pinned dependency versions, Windows environment pitfalls, verified RSS source facts, UI architecture facts). It plays the role a glossary would otherwise serve for many of these terms — read it, and don't duplicate its content into a new glossary.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
