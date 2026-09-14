# PAMP

## Versioning

Every push is a new version, and every commit in that push starts with it:

```
v0.1.0 Add ticket check-in
```

- The `version` in `package.json` is the current version. Bump it once per push, in the same push, and use the new number as the commit prefix.
- Choose the bump from what the push contains:
  - **Patch** (`v0.1.0` → `v0.1.1`): bug fixes, copy, config or dependency changes only.
  - **Minor** (`v0.1.1` → `v0.2.0`): any new feature or change in behaviour.
  - **Major** (`v1.0.0`): reserved for the market launch.
- Versioning started at `v0.0.0`. Commits pushed before that have no prefix; leave them as they are.
