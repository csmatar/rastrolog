from typing import Any

import pytest
from helpers import REFERRER_CASES, UA_CASES

from rastrolog.signals import load_signals

POSITIVE_KINDS = {"vendor", "observed", "token"}


def test_every_user_agent_crawler_has_a_positive_fixture() -> None:
    wanted = {c.id for c in load_signals().crawlers if c.match == "user_agent"}
    covered = {case["expect"]["id"] for case in UA_CASES if case["expect"]}
    assert wanted - covered == set(), "add a real UA string to conformance/user_agents.json"


def test_every_referrer_has_a_positive_fixture() -> None:
    wanted = {r.id for r in load_signals().referrers}
    covered = {case["expect"]["id"] for case in REFERRER_CASES if case["expect"]}
    assert wanted - covered == set(), "add a referrer URL to conformance/referrers.json"


def test_fixtures_only_reference_known_ids() -> None:
    known = {c.id for c in load_signals().crawlers} | {r.id for r in load_signals().referrers}
    used = {case["expect"]["id"] for case in UA_CASES + REFERRER_CASES if case["expect"]}
    assert used <= known


@pytest.mark.parametrize(
    "case", [c for c in UA_CASES if c["expect"]], ids=lambda c: c["expect"]["id"]
)
def test_positive_ua_fixtures_cite_a_source(case: dict[str, Any]) -> None:
    assert case["kind"] in POSITIVE_KINDS
    assert case["source"].startswith("https://")
