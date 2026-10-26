"""Package only tracked extension files, with manifest.json at the ZIP root."""

import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
subprocess.run(["node", "scripts/version.mjs", "check"], cwd=root, check=True)
version = json.loads((root / "extension/manifest.json").read_text())["version"]
paths = subprocess.check_output(
    ["git", "ls-files", "-z", "--", "extension/"], cwd=root
).decode().rstrip("\0").split("\0")
output = root / "dist" / f"stream-bridge-{version}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        source = root / path
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"Expected a regular extension file: {path}")
        # Fixed metadata makes the same file contents produce the same ZIP.
        entry = zipfile.ZipInfo(Path(path).relative_to("extension").as_posix())
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, source.read_bytes())
with zipfile.ZipFile(output) as archive:
    if "manifest.json" not in archive.namelist() or archive.testzip() is not None:
        raise ValueError("Invalid extension archive")
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(f"{checksum}  {output.name}\n")
print(output.relative_to(root))
