from typing import Any

import pytest
from helpers import REFERRER_CASES, UA_CASES

from rastrolog import classify_referrer, classify_user_agent
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


def _expected_id(case: dict[str, Any]) -> str | None:
    return case["expect"]["id"] if case["expect"] else None


@pytest.mark.parametrize("case", UA_CASES, ids=lambda c: c["ua"][:70])
def test_user_agent_fixture_classifies_as_expected(case: dict[str, Any]) -> None:
    match = classify_user_agent(case["ua"])
    assert (match.id if match else None) == _expected_id(case)


@pytest.mark.parametrize("case", REFERRER_CASES, ids=lambda c: c["referrer"] or "<empty>")
def test_referrer_fixture_classifies_as_expected(case: dict[str, Any]) -> None:
    match = classify_referrer(case["referrer"], own_host=case.get("own_host"))
    assert (match.id if match else None) == _expected_id(case)
