from __future__ import annotations

import hashlib
import shutil
import urllib.request
import zipfile
from pathlib import Path

BASE_URL = "https://files.grouplens.org/datasets/movielens"
ARCHIVE_NAME = "ml-32m.zip"
EXPECTED_FILE_MD5 = {
    "links.csv": "8f033867bcb4e6be8792b21468b4fa6e",
    "movies.csv": "0df90835c19151f9d819d0822e190797",
    "ratings.csv": "cf12b74f9ad4b94a011f079e26d4270a",
    "tags.csv": "963bf4fa4de6b8901868fddd3eb54567",
}
ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"


def md5(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as source:
        while chunk := source.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
        return response.read().decode("utf-8").strip()


def download_file(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "SplitTaste research demo"})
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
    temporary.replace(destination)


def verify_extracted(dataset_dir: Path) -> None:
    failures: list[str] = []
    for filename, expected in EXPECTED_FILE_MD5.items():
        path = dataset_dir / filename
        actual = md5(path) if path.exists() else "missing"
        if actual != expected:
            failures.append(f"{filename}: expected {expected}, got {actual}")
    if failures:
        raise RuntimeError("MovieLens file verification failed:\n" + "\n".join(failures))


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    archive = RAW_DIR / ARCHIVE_NAME
    remote_md5 = fetch_text(f"{BASE_URL}/{ARCHIVE_NAME}.md5").split()[0]

    if not archive.exists():
        print(f"Downloading {ARCHIVE_NAME} from GroupLens...")
        download_file(f"{BASE_URL}/{ARCHIVE_NAME}", archive)

    actual_md5 = md5(archive)
    if actual_md5 != remote_md5:
        raise RuntimeError(f"Archive checksum mismatch: expected {remote_md5}, got {actual_md5}")
    print(f"Archive verified: {actual_md5}")

    dataset_dir = RAW_DIR / "ml-32m"
    if not dataset_dir.exists():
        with zipfile.ZipFile(archive) as source:
            source.extractall(RAW_DIR)
    verify_extracted(dataset_dir)
    print(f"MovieLens files verified in {dataset_dir}")


if __name__ == "__main__":
    main()
