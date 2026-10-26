# Extension releases

The version policy and required checks are in [AGENTS.md](../AGENTS.md). Versions use three numeric components compatible with [Chromium's manifest version format](https://developer.chrome.com/docs/extensions/reference/manifest/version).

## Prepare a change

1. Start from the current `main` and implement the change.
2. Run `npm run version:bump -- patch` once per change set. The command updates `extension/manifest.json`, `package.json`, both root versions in `package-lock.json`, and creates the next changelog section. Write English notes under that version. Use `minor` for substantial new capabilities or `major` for intentional incompatible releases, explaining the choice in the PR.
3. Run the checks listed in `AGENTS.md`. If `main` advances to the same version while the PR is open, update the branch and choose the next version before merging.

## Publication

The Checks workflow validates versions against the PR base or the previous push, then runs syntax, unit, and Chromium tests. On a successful push to `main`, its release job packages that exact commit and creates `v<version>` with notes from `CHANGELOG.md`. The job uses GitHub's built-in token with `contents: write`; no additional secret is needed.

Each release has two uploaded assets:

- `stream-bridge-<version>.zip`: only tracked files from `extension/`, with `manifest.json` directly at the ZIP root.
- `stream-bridge-<version>.zip.sha256`: the archive's SHA-256 checksum.

GitHub also displays its automatic source-code archives. Installation instructions point to the extension ZIP instead.

## Local packaging and recovery

Run `npm run package:extension` with Node.js, Python 3, and Git installed. The ZIP and checksum are written to the ignored `dist/` directory. Packaging reads the current contents of tracked extension files; add new extension files to Git before packaging. Commit all release changes before publication.

To recover a failed publication, rerun the failed release job for that commit. The job creates a draft, uploads both assets, and publishes it only after the uploads succeed. An existing draft can be completed by a rerun. A published release is left unchanged, and an existing tag pointing at another commit causes a failure. Fix released extension problems with the next patch version.

For an initial manual publication, use the same tested commit, `node scripts/version.mjs notes` for the notes, and the assets produced by `npm run package:extension`. Publish a draft only after verifying its target and assets; the workflow automates this for subsequent changes on `main`.
