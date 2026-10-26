import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isVersionIncrement, nextVersion, parseVersion, releaseNotes } from "../../scripts/version.mjs";

const script = fileURLToPath(new URL("../../scripts/version.mjs", import.meta.url));

test("versions use numeric Chromium-compatible components and conservative increments", () => {
  assert.equal(nextVersion("0.3.0"), "0.3.1");
  assert.equal(nextVersion("0.3.9", "minor"), "0.4.0");
  assert.equal(nextVersion("0.3.9", "major"), "1.0.0");
  assert.equal(isVersionIncrement("0.3.65535", "0.4.0"), true);
  for (const value of ["0.3.0", "0.3.2", "0.5.0", "0.2.9"]) {
    assert.equal(isVersionIncrement("0.3.0", value), false);
  }
  for (const value of ["0.0.0", "0.03.1", "0.3.1-beta", "0.3", "0.3.65536", null]) {
    assert.throws(() => parseVersion(value));
  }
  assert.throws(() => nextVersion("0.3.65535"));
  assert.throws(() => nextVersion("0.3.0", "feature"));
});

test("release notes include only the exact version's section and require meaningful content", () => {
  const notes = "# Changelog\n\n## Unreleased\n\n- Future work.\n\n## 0.3.1\n\n### Fixed\n\n- Fix playback.\n\n## 0.3.0\n\n- Old changes.\n";
  assert.equal(releaseNotes(notes, "0.3.1"), "### Fixed\n\n- Fix playback.\n");
  assert.throws(() => releaseNotes(notes, "0.3.2"));
  assert.throws(() => releaseNotes("## 0.3.1\n\n### Fixed\n", "0.3.1"));
  assert.throws(() => releaseNotes(`${notes}\n## 0.3.1\n- Duplicate.`, "0.3.1"));
});

test("CLI blocks forgotten bumps, syncs all versions, and packages only tracked extension files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "stream-bridge-release-"));
  const writeJson = (path, data) => writeFileSync(join(cwd, path), `${JSON.stringify(data, null, 2)}\n`);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  try {
    mkdirSync(join(cwd, "extension"));
    mkdirSync(join(cwd, "scripts"));
    copyFileSync(script, join(cwd, "scripts/version.mjs"));
    copyFileSync(new URL("../../scripts/package-extension.py", import.meta.url), join(cwd, "scripts/package-extension.py"));
    writeJson("extension/manifest.json", { manifest_version: 3, version: "0.3.0" });
    writeJson("package.json", { version: "0.3.0" });
    writeJson("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
    writeFileSync(join(cwd, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.3.0\n\n- Initial version.\n");
    git("init", "--quiet");
    git("add", ".");
    git("-c", "user.name=Release Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Initial fixture");
    assert.equal(run("check", "--base", "HEAD").status, 0);
    writeFileSync(join(cwd, "README.md"), "Documentation change\n");
    git("add", "README.md");
    assert.match(run("check", "--base", "HEAD").stderr, /require one version increment/);
    assert.equal(run("bump").status, 0);
    assert.match(run("check").stderr, /Add release notes/);
    const changelog = join(cwd, "CHANGELOG.md");
    writeFileSync(changelog, readFileSync(changelog, "utf8").replace("## 0.3.1", "## 0.3.1\n\n### Added\n\n- Release download."));
    assert.equal(run("check", "--base", "HEAD").status, 0);
    assert.match(run("notes").stdout, /^### Added\n\n- Release download\.\n$/);
    for (const path of ["package.json", "package-lock.json", "extension/manifest.json"]) {
      assert.equal(JSON.parse(readFileSync(join(cwd, path))).version, "0.3.1");
    }
    writeJson("package.json", { version: "0.3.2" });
    assert.match(run("check").stderr, /versions must match/);
    writeJson("package.json", { version: "0.3.1" });
    assert.notEqual(run("check", "--base", "missing-ref").status, 0);
    writeFileSync(join(cwd, "extension/private-untracked.txt"), "Excluded\n");
    execFileSync("python3", ["scripts/package-extension.py"], { cwd });
    execFileSync("python3", ["-c", `
import hashlib, json, pathlib, zipfile
archive = pathlib.Path('dist/stream-bridge-0.3.1.zip')
with zipfile.ZipFile(archive) as z:
    assert z.namelist() == ['manifest.json'], z.namelist()
    assert json.loads(z.read('manifest.json'))['version'] == '0.3.1'
assert archive.with_suffix('.zip.sha256').read_text().split()[0] == hashlib.sha256(archive.read_bytes()).hexdigest()
`], { cwd });
    const first = readFileSync(join(cwd, "dist/stream-bridge-0.3.1.zip"));
    execFileSync("python3", ["scripts/package-extension.py"], { cwd });
    assert.deepEqual(readFileSync(join(cwd, "dist/stream-bridge-0.3.1.zip")), first);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
