"""Shared test data: repo paths, conformance fixtures, sample user agents."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from rastrolog.report import Report

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFORMANCE = REPO_ROOT / "conformance"
LOGS = CONFORMANCE / "logs"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


UA_CASES: list[dict[str, Any]] = load_json(CONFORMANCE / "user_agents.json")
REFERRER_CASES: list[dict[str, Any]] = load_json(CONFORMANCE / "referrers.json")


def _ua_for(key: str) -> str:
    """First fixture UA whose label or expected id equals ``key``."""
    for case in UA_CASES:
        if case.get("label") == key or (case["expect"] and case["expect"]["id"] == key):
            return str(case["ua"])
    raise KeyError(key)


SAMPLE_UA = {
    "gptbot": _ua_for("openai-gptbot"),
    "chatgpt_user": _ua_for("openai-chatgpt-user"),
    "claudebot": _ua_for("anthropic-claudebot"),
    "perplexitybot": _ua_for("perplexity-perplexitybot"),
    "googlebot": _ua_for("google-googlebot"),
    "browser": _ua_for("browser-chrome"),
}


def report_for(name: str, **kwargs: Any) -> Report:
    """Parse conformance/logs/<name>.log and aggregate it."""
    from rastrolog.parse import ParseStats, iter_records
    from rastrolog.report import Aggregator

    stats = ParseStats()
    aggregator = Aggregator(**kwargs)
    aggregator.add_all(iter_records(LOGS / f"{name}.log", stats=stats))
    return aggregator.result(skipped=stats.skipped)
