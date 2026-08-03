import json
from pathlib import Path

from pipeline.download import EXPECTED_FILE_MD5

ROOT = Path(__file__).resolve().parents[1]


def test_official_checksum_manifest_is_complete() -> None:
    assert set(EXPECTED_FILE_MD5) == {"links.csv", "movies.csv", "ratings.csv", "tags.csv"}
    assert all(len(value) == 32 for value in EXPECTED_FILE_MD5.values())


def test_public_bundle_has_no_evaluator_identifiers() -> None:
    bundle_text = (ROOT / "public" / "data" / "demo-bundle.json").read_text()
    forbidden = ("userId", "source_user", "timestamp", "/Users/")
    assert not any(term in bundle_text for term in forbidden)


def test_public_bundle_contract_is_guided_and_synthetic() -> None:
    bundle = json.loads((ROOT / "public" / "data" / "demo-bundle.json").read_text())
    assert bundle["schemaVersion"] == "1.1"
    assert bundle["dataset"]["syntheticHouseholds"] is True
    assert bundle["account"]["modeledLaneCount"] == 3
    assert len(bundle["lanes"]) == 3
    assert len(bundle["correctionCandidates"]) == 3
    assert len({lane["name"] for lane in bundle["lanes"]}) == 3
    assert all(candidate["rating"] >= 4.0 for candidate in bundle["correctionCandidates"])
    assert bundle["research"]["source"]["ratingEvents"] == 32_000_204
    assert bundle["research"]["modelingCohort"]["embeddingDimensions"] == 32
    assert bundle["research"]["householdDesign"]["households"] == 72
    assert {row["dimension"] for row in bundle["research"]["cohortResults"]} == {
        "activity",
        "household size",
        "overlap",
        "sparsity",
    }
