import re
from pathlib import Path

import jsonschema
import pytest
from helpers import REPO_ROOT, load_json

from rastrolog import signals as signals_module
from rastrolog.signals import load_signals, parse_signals

RAW = load_json(REPO_ROOT / "signals.json")


def normalize_host(host: str) -> str:
    # Same rule as rastrolog.classify.normalize_host; duplicated so this data test
    # doesn't depend on the classifier.
    host = host.strip().lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def test_signals_json_matches_schema() -> None:
    schema = load_json(REPO_ROOT / "signals.schema.json")
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(RAW)


def test_ids_are_unique() -> None:
    ids = [e["id"] for e in RAW["crawlers"]] + [e["id"] for e in RAW["referrers"]]
    assert len(ids) == len(set(ids))


def test_crawler_tokens_are_unique_ignoring_case() -> None:
    tokens = [e["token"].lower() for e in RAW["crawlers"]]
    assert len(tokens) == len(set(tokens))


def test_crawler_ids_follow_the_naming_rule() -> None:
    for entry in RAW["crawlers"]:
        assert entry["id"] == f"{entry['vendor']}-{entry['token'].lower()}"


def _slug(product: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", product.lower()).strip("-")


def test_referrer_ids_follow_the_product_slug_rule() -> None:
    """Referrer id = the product name lowercased, with runs of non-alphanumeric
    characters collapsed to a single ``-`` and trimmed from the ends."""
    for entry in RAW["referrers"]:
        assert entry["id"] == _slug(entry["product"]), entry


def test_referrer_hosts_are_claimed_once() -> None:
    hosts = [normalize_host(h) for e in RAW["referrers"] for h in e["hosts"]]
    assert len(hosts) == len(set(hosts))


def test_loader_returns_typed_view() -> None:
    signals = load_signals()
    assert signals.schema_version == 1
    assert [c.id for c in signals.crawlers] == [e["id"] for e in RAW["crawlers"]]
    assert signals.referrers[0].hosts == tuple(RAW["referrers"][0]["hosts"])


def test_loader_is_cached() -> None:
    assert load_signals() is load_signals()


def test_bundled_file_wins_over_repo_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "signals.json").write_text('{"marker": "bundled"}', encoding="utf-8")
    monkeypatch.setattr(signals_module, "files", lambda _pkg: tmp_path)
    assert signals_module._read_raw() == '{"marker": "bundled"}'


def test_third_party_sourced_entries_are_flagged_and_rare() -> None:
    third_party = [c for c in load_signals().crawlers if not c.vendor_documented]
    assert [c.id for c in third_party] == ["bytedance-bytespider"]
    assert third_party[0].docs_url.startswith("https://darkvisitors.com/")


def test_parse_signals_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValueError, match="schema_version"):
        parse_signals({**RAW, "schema_version": 2})
