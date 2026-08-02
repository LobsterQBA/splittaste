# Local data directory

Run `uv run python -m pipeline.download` to populate `data/raw/ml-32m` from the official GroupLens host. The acquisition command validates the archive checksum and the four file checksums published in the MovieLens README.

`raw/`, `processed/`, and `evaluator/` are intentionally ignored by Git:

- `raw/`: official zip and extracted CSV files
- `processed/`: normalized Parquet tables
- `evaluator/`: model arrays and source-user ground truth

Never move source-user mappings into `public/` or `artifacts/`.

