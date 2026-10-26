# Versioning and releases

- Every completed change set / pull request increments the extension version once, including documentation and tooling changes. Further edits within the same unreleased change set keep that version.
- Use a patch increment by default (`0.3.1` → `0.3.2`). Use a minor increment only for a substantial new capability, and a major increment only for an intentional incompatible release. Explain either larger increment in the change description.
- Run `npm run version:bump -- patch` (or `minor` / `major`) to update the manifest, package metadata, lockfile, and changelog heading together. Add concise English release notes for the actual changes under that version in `CHANGELOG.md`.
- Before handoff, run `npm run version:check -- --base origin/main`, `npm run check`, `npm test`, and `npm run package:extension`. Inspect the ZIP: `manifest.json` must be at its root and it must contain only tracked files from `extension/`.
- The successful Checks workflow on `main` publishes `v<version>` with the extension ZIP and its SHA-256 checksum. Release notes come from that version's changelog section. See [the release guide](docs/RELEASING.md) for recovery and local packaging.
