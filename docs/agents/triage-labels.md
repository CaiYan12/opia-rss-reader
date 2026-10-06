# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## State in the tracker (as of 2026-10-06)

These five labels do not exist in the repository yet — only GitHub's default set (`bug`, `enhancement`, `documentation`, `wontfix`, …) is present. `wontfix` already matches the default string; the other four have to be created before first use:

```bash
gh label create needs-triage    --color "ededed" --description "Maintainer needs to evaluate this issue"
gh label create needs-info      --color "ededed" --description "Waiting on reporter for more information"
gh label create ready-for-agent --color "0e8a16" --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --color "1d76db" --description "Requires human implementation"
```

(`gh label create` takes `<name>` then flags — `--color` / `--description`; color is a bare 6-digit hex, no `#`. Add `--force` to update an existing one.)

Label creation is a one-off setup step, not something a skill should do implicitly. Run it once if a triage workflow actually needs these labels.
