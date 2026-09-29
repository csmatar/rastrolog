import time
from dataclasses import FrozenInstanceError

import pytest
from helpers import SAMPLE_UA

from rastrolog import Match, classify_referrer, classify_request, classify_user_agent
from rastrolog.classify import _MAX_CACHED_LEN, _classify_user_agent, _ua_index, normalize_host
from rastrolog.signals import load_signals


def test_gptbot_is_an_openai_training_crawler() -> None:
    assert classify_user_agent(SAMPLE_UA["gptbot"]) == Match(
        kind="crawler",
        id="openai-gptbot",
        vendor="openai",
        vendor_name="OpenAI",
        token="GPTBot",
        purpose="training",
        ai_specific=True,
    )


def test_user_agent_match_is_case_insensitive() -> None:
    match = classify_user_agent("mozilla/5.0 (compatible; gptbot/1.3)")
    assert match is not None
    assert match.id == "openai-gptbot"


@pytest.mark.parametrize("ua", [None, "", "   ", SAMPLE_UA["browser"]])
def test_unrecognised_user_agents_return_none(ua: str | None) -> None:
    assert classify_user_agent(ua) is None


def test_search_engine_crawler_is_flagged_but_not_ai() -> None:
    match = classify_user_agent(SAMPLE_UA["googlebot"])
    assert match is not None
    assert match.purpose == "search_index"
    assert match.ai_specific is False


def test_robots_only_tokens_never_match_as_themselves() -> None:
    robots_only = [c.token for c in load_signals().crawlers if c.match == "robots_only"]
    assert robots_only, "signals.json should list at least one robots_only token"
    for token in robots_only:
        match = classify_user_agent(f"Mozilla/5.0 (compatible; {token}/1.0)")
        assert match is None or match.token != token


def test_tokens_are_tried_longest_first() -> None:
    lengths = [len(token) for token, _ in _ua_index()]
    assert lengths == sorted(lengths, reverse=True)


@pytest.mark.parametrize(
    ("url", "expected_id"),
    [
        ("https://chatgpt.com/", "chatgpt"),
        ("https://www.perplexity.ai/search?q=rastrolog", "perplexity"),
        ("https://gemini.google.com/app", "gemini"),
        ("https://duck.ai/chat", "duck-ai"),
    ],
)
def test_ai_referrers_classify(url: str, expected_id: str) -> None:
    match = classify_referrer(url)
    assert match is not None
    assert match.kind == "referral"
    assert match.id == expected_id


@pytest.mark.parametrize(
    "url",
    [
        None,
        "",
        "https://www.google.com/",
        "chatgpt.com",
        "not a url",
        "https://chatgpt.com.evil.example/",
    ],
)
def test_non_ai_or_malformed_referrers_return_none(url: str | None) -> None:
    assert classify_referrer(url) is None


@pytest.mark.parametrize(
    "url",
    ["https://www.bing.com/", "https://x.com/", "https://duckduckgo.com/"],
)
def test_shared_hosts_are_not_claimed(url: str) -> None:
    # bing.com (Copilot), x.com (Grok) and duckduckgo.com send only their origin as
    # Referer, so AI traffic from them can't be told apart. Documented gap: never guess.
    assert classify_referrer(url) is None


def test_own_host_is_never_a_referral() -> None:
    assert classify_referrer("https://chatgpt.com/", own_host="www.ChatGPT.com") is None


def test_normalize_host() -> None:
    assert normalize_host("WWW.Example.COM.") == "example.com"


def test_match_is_frozen_and_serialisable() -> None:
    match = classify_referrer("https://claude.ai/")
    assert match is not None
    assert match.to_dict() == {
        "kind": "referral",
        "id": "claude",
        "vendor": "anthropic",
        "vendor_name": "Anthropic",
        "product": "Claude",
        "token": None,
        "purpose": None,
        "ai_specific": True,
    }
    with pytest.raises(FrozenInstanceError):
        match.id = "other"  # type: ignore[misc]


def test_classify_request_prefers_the_crawler() -> None:
    match = classify_request(SAMPLE_UA["gptbot"], "https://chatgpt.com/")
    assert match is not None
    assert match.kind == "crawler"


def test_classify_request_falls_back_to_the_referral() -> None:
    match = classify_request(SAMPLE_UA["browser"], "https://chatgpt.com/")
    assert match is not None
    assert match.kind == "referral"


def test_classify_request_with_nothing_is_none() -> None:
    assert classify_request(None, None) is None


def test_long_user_agents_still_classify_but_bypass_the_cache() -> None:
    padding = "x" * (600 - len("GPTBot")) + "GPTBot"
    assert len(padding) == 600
    assert len(padding) > _MAX_CACHED_LEN
    before = _classify_user_agent.cache_info().currsize
    match = classify_user_agent(padding)
    assert match is not None
    assert match.id == "openai-gptbot"
    assert _classify_user_agent.cache_info().currsize == before


def test_many_label_hosts_classify_in_linear_time() -> None:
    """Only suffixes as long as the longest listed host can match, so a hostile
    Referer with thousands of labels must not cost quadratic time (GHSA-j9gx-mm38-pr3j)."""
    url = "https://" + "a." * 20_000 + "com/"
    started = time.perf_counter()
    assert classify_referrer(url) is None
    assert time.perf_counter() - started < 0.2  # was ~2.3 s before the fix


@pytest.mark.parametrize(
    ("host", "expected_id"),
    [
        ("x." * 1_000 + "notebooklm.google.com", "notebooklm"),  # longest listed host (3 labels)
        ("x." * 1_000 + "chatgpt.com", "chatgpt"),
        ("x." * 1_000 + "com", None),
    ],
)
def test_deep_subdomains_still_match(host: str, expected_id: str | None) -> None:
    match = classify_referrer(f"https://{host}/")
    assert (match.id if match else None) == expected_id
