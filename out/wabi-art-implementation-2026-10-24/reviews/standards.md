# Standards Review

Reviewed `git diff 1c7dcfb887e66f6e411e06d4f0f2ddf320730562...HEAD` at HEAD `97d81952b1e2c0b4c816d1697d48dd44e222a7a6`.

**Documented-standard violations: none found.** The added presentation components keep styling in `src/renderer/juya/juya.css`; new rules and variant tokens are Wabi-scoped, and the JSX adds no hard-coded color values. The diff does not alter shared defaults, IPC, or renderer network/filesystem boundaries. This conforms to `AGENTS.md:5-15` and `docs/agents/ui-reference.md:37-44`.

**Heuristic smell — possible Duplicated Code (low):** The CDP platform-font probe setup is repeated in `tests/e2e/wabi-feed.spec.ts:45-58` and `tests/e2e/wabi-reading-craft.spec.ts:99-107,215-223` (session creation, DOM/CSS enablement, node lookup, font retrieval, detach). A shared test helper would reduce protocol drift if these probes continue to be maintained together. This is a judgement call, not a documented-standard breach.
