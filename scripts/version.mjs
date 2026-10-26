import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function parseVersion(version) {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a numeric major.minor.patch version, got ${version}`);
  }
  const parts = version.split(".").map(Number);
  if (parts.some((part) => part > 65535) || parts.every((part) => part === 0)) {
    throw new Error(`Version ${version} is outside Chromium's version range`);
  }
  return parts;
}

export function nextVersion(version, type = "patch") {
  const parts = parseVersion(version);
  const index = ["major", "minor", "patch"].indexOf(type);
  if (index < 0) throw new Error("Choose patch, minor, or major");
  parts[index] += 1;
  parts.fill(0, index + 1);
  const next = parts.join(".");
  parseVersion(next);
  return next;
}

export function isVersionIncrement(previous, current) {
  const [major, minor, patch] = parseVersion(previous);
  parseVersion(current);
  return [[major, minor, patch + 1], [major, minor + 1, 0], [major + 1, 0, 0]]
    .some((parts) => parts.join(".") === current);
}

export function releaseNotes(changelog, version) {
  parseVersion(version);
  const lines = changelog.split(/\r?\n/);
  const heading = `## ${version}`;
  const start = lines.indexOf(heading);
  if (start < 0 || lines.lastIndexOf(heading) !== start) {
    throw new Error(`Expected exactly one ${heading} section in CHANGELOG.md`);
  }
  const following = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const notes = lines.slice(start + 1, following < 0 ? undefined : following).join("\n").trim();
  if (!/^- \S/m.test(notes)) throw new Error(`Add release notes for ${version} to CHANGELOG.md`);
  return `${notes}\n`;
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function check() {
  const manifest = readJson("extension/manifest.json");
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  parseVersion(manifest.version);
  if ([pkg.version, lock.version, lock.packages[""].version].some((version) => version !== manifest.version)) {
    throw new Error("Manifest, package.json, and package-lock.json versions must match");
  }
  releaseNotes(readFileSync("CHANGELOG.md", "utf8"), manifest.version);
  return manifest.version;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "bump") {
    if (args.length > 1) throw new Error("Usage: npm run version:bump -- [patch|minor|major]");
    const current = check();
    const version = nextVersion(current, args[0]);
    const files = ["package.json", "package-lock.json", "extension/manifest.json"];
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    if (!/^## Unreleased$/m.test(changelog)) throw new Error("Missing ## Unreleased changelog section");
    for (const file of files) {
      const data = readJson(file);
      data.version = version;
      if (file === "package-lock.json") data.packages[""].version = version;
      // Preserve the manifest's compact layout and existing formatting.
      const original = readFileSync(file, "utf8");
      writeFileSync(file, file === "extension/manifest.json"
        ? original.replace(`"version": "${current}"`, `"version": "${version}"`)
        : `${JSON.stringify(data, null, 2)}\n`);
    }
    writeFileSync("CHANGELOG.md", changelog.replace(/^## Unreleased$/m, `## Unreleased\n\n## ${version}`));
    console.log(`Version ${current} → ${version}; add release notes under ## ${version}`);
    return;
  }
  const version = check();
  if (command === "check") {
    if (args.length) {
      if (args.length !== 2 || args[0] !== "--base") throw new Error("Usage: npm run version:check -- [--base <git-ref>]");
      const base = args[1];
      const previous = JSON.parse(execFileSync("git", ["show", `${base}:extension/manifest.json`], { encoding: "utf8" })).version;
      const changed = execFileSync("git", ["diff", "--name-only", base, "--"], { encoding: "utf8" }).trim();
      if (changed && !isVersionIncrement(previous, version)) {
        throw new Error(`Changes require one version increment from ${previous}; use npm run version:bump -- patch`);
      }
    }
    console.log(`Version ${version} is consistent`);
  } else if (command === "notes" && args.length === 0) {
    process.stdout.write(releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version));
  } else {
    throw new Error("Usage: node scripts/version.mjs check [--base <git-ref>] | bump [patch|minor|major] | notes");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
