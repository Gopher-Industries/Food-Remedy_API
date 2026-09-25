#!/usr/bin/env bash
set -euo pipefail
version=8.30.1
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) platform=darwin_arm64 ;;
  Darwin-x86_64) platform=darwin_x64 ;;
  Linux-x86_64) platform=linux_x64 ;;
  Linux-aarch64) platform=linux_arm64 ;;
  *) echo 'Unsupported platform' >&2; exit 1 ;;
esac
destination="${1:?Pass an installation directory}"
mkdir -p "$destination"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
asset="gitleaks_${version}_${platform}.tar.gz"
base="https://github.com/gitleaks/gitleaks/releases/download/v${version}"
curl --fail --silent --show-error --location "$base/$asset" -o "$scratch/$asset"
curl --fail --silent --show-error --location "$base/gitleaks_${version}_checksums.txt" -o "$scratch/checksums.txt"
python3 - "$scratch" "$asset" "$destination" <<'PY'
import hashlib, pathlib, sys, tarfile
scratch, name, destination = pathlib.Path(sys.argv[1]), sys.argv[2], pathlib.Path(sys.argv[3])
expected = next(line.split()[0] for line in (scratch / 'checksums.txt').read_text().splitlines() if line.split()[-1] == name)
if hashlib.sha256((scratch / name).read_bytes()).hexdigest() != expected:
    raise SystemExit('Checksum verification failed')
with tarfile.open(scratch / name) as archive:
    binary = archive.extractfile('gitleaks')
    (destination / 'gitleaks').write_bytes(binary.read())
(destination / 'gitleaks').chmod(0o755)
print('Gitleaks 8.30.1 installed; release checksum verified')
PY
