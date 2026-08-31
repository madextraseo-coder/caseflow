from __future__ import annotations

import base64
import hashlib
import zipfile
from pathlib import Path

EXPECTED_SHA256 = "e293e6411ef19f8d13d011d91b7c57947ce57784bf5797c338f3025b19d6c2bb"
PACKAGE_DIR = Path(__file__).resolve().parent
OUTPUT_ZIP = PACKAGE_DIR.parent / "caseflow-browser-demo-v8-premium-enterprise-ui.zip"

parts = sorted(PACKAGE_DIR.glob("part-*.b64"))
if not parts:
    raise SystemExit("No package chunks found.")

encoded = "".join(part.read_text(encoding="utf-8").strip() for part in parts)
payload = base64.b64decode(encoded)
actual = hashlib.sha256(payload).hexdigest()

if actual != EXPECTED_SHA256:
    raise SystemExit(f"Checksum mismatch: expected {EXPECTED_SHA256}, got {actual}")

OUTPUT_ZIP.write_bytes(payload)

with zipfile.ZipFile(OUTPUT_ZIP) as archive:
    archive.extractall(PACKAGE_DIR.parent)

print(f"Verified SHA-256: {actual}")
print(f"Created: {OUTPUT_ZIP}")
print("Extracted CASEFLOW v8 premium browser demo successfully.")
