import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from helpers import LOGS, SAMPLE_UA, load_json, report_for

from rastrolog.formats import LogRecord
from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator, parse_since

UTC = timezone.utc
ALL_LOGS = ["nginx", "apache", "cloudfront", "alb"]
WITH_REFERRERS = ["nginx", "apache", "cloudfront"]


@pytest.mark.parametrize("name", ALL_LOGS)
def test_crawler_rows(name: str) -> None:
    report = report_for(name)
    rows = {row.id: row for row in report.crawlers}
    gptbot = rows["openai-gptbot"]
    assert (gptbot.requests, gptbot.unique_pages) == (3, 2)
    assert gptbot.top_pages == (("/docs", 2), ("/pricing", 1))
    assert gptbot.last_seen == datetime(2026, 9, 22, 8, 0, tzinfo=UTC)
    claudebot = rows["anthropic-claudebot"]
    assert claudebot.top_pages == (("/blog/ai-traffic", 1), ("/docs", 1))
    assert rows["openai-chatgpt-user"].requests == 1
    assert rows["perplexity-perplexitybot"].top_pages == (("/robots.txt", 1),)
    assert rows["google-googlebot"].ai_specific is False
    assert report.ai_crawler_requests == 7
    assert (report.records, report.skipped) == (14, 1)


def test_rows_sort_by_count_then_id() -> None:
    ids = [row.id for row in report_for("nginx").crawlers]
    assert ids == [
        "openai-gptbot",
        "anthropic-claudebot",
        "google-googlebot",
        "openai-chatgpt-user",
        "perplexity-perplexitybot",
    ]


@pytest.mark.parametrize("name", WITH_REFERRERS)
def test_referral_rows_merge_query_strings(name: str) -> None:
    report = report_for(name)
    rows = {row.id: row for row in report.referrals}
    assert set(rows) == {"chatgpt", "perplexity", "claude"}
    chatgpt = rows["chatgpt"]
    assert (chatgpt.visits, chatgpt.unique_pages, chatgpt.top_pages) == (2, 1, (("/pricing", 2),))
    assert chatgpt.product == "ChatGPT"
    assert rows["perplexity"].top_pages == (("/docs", 1),)
    assert rows["claude"].top_pages == (("/blog/ai-traffic", 1),)
    assert report.ai_referral_visits == 4


def test_alb_logs_have_no_referrals() -> None:
    assert report_for("alb").referrals == ()


def test_page_pivot() -> None:
    pages = report_for("nginx").pages
    assert [(p.path, p.total) for p in pages] == [
        ("/docs", 4),
        ("/pricing", 4),
        ("/blog/ai-traffic", 2),
        ("/robots.txt", 1),
    ]
    docs = pages[0]
    assert docs.crawlers == (("GPTBot", 2), ("ClaudeBot", 1))
    assert docs.referrals == (("Perplexity", 1),)


def test_top_limits_pages_and_top_pages() -> None:
    aggregator = Aggregator()
    for i in range(5):
        aggregator.add(
            LogRecord(datetime(2026, 9, 1, tzinfo=UTC), f"/p{i}", 200, SAMPLE_UA["gptbot"], "")
        )
    report = aggregator.result(top=2)
    assert len(report.pages) == 2
    assert len(report.crawlers[0].top_pages) == 2
    assert report.crawlers[0].unique_pages == 5


def test_since_filters_by_timestamp() -> None:
    report = report_for("nginx", since=datetime(2026, 9, 24, tzinfo=UTC))
    assert {row.id for row in report.crawlers} == {"perplexity-perplexitybot", "google-googlebot"}
    assert {row.id: row.visits for row in report.referrals} == {
        "chatgpt": 2,
        "perplexity": 1,
        "claude": 1,
    }
    assert report.records == 14


def test_crawler_with_an_ai_referrer_is_only_a_crawler() -> None:
    aggregator = Aggregator()
    aggregator.add(
        LogRecord(
            datetime(2026, 9, 1, tzinfo=UTC), "/", 200, SAMPLE_UA["gptbot"], "https://chatgpt.com/"
        )
    )
    report = aggregator.result()
    assert [row.id for row in report.crawlers] == ["openai-gptbot"]
    assert report.referrals == ()


def test_own_host_is_not_a_referral() -> None:
    aggregator = Aggregator(own_host="chatgpt.com")
    aggregator.add(
        LogRecord(
            datetime(2026, 9, 1, tzinfo=UTC), "/", 200, SAMPLE_UA["browser"], "https://chatgpt.com/"
        )
    )
    assert aggregator.result().referrals == ()


def test_to_dict_shape() -> None:
    data = report_for("nginx").to_dict()
    assert set(data) == {"summary", "crawlers", "referrals", "pages"}
    assert data["summary"] == {
        "records": 14,
        "skipped": 1,
        "ai_crawler_requests": 7,
        "ai_referral_visits": 4,
    }
    first = data["crawlers"][0]
    assert first["last_seen"] == "2026-09-22T08:00:00+00:00"
    assert first["top_pages"][0] == {"path": "/docs", "count": 2}
    json.dumps(data)  # serialisable


def test_to_dict_truncates_last_seen_to_whole_seconds() -> None:
    """A microsecond-precision timestamp (e.g. from an ALB log, which carries
    fractional seconds) must serialise to whole-second UTC, so the report JSON
    is portable across implementations that don't preserve microseconds."""
    aggregator = Aggregator()
    aggregator.add(
        LogRecord(
            datetime(2026, 9, 1, 12, 0, 0, 123456, tzinfo=UTC),
            "/",
            200,
            SAMPLE_UA["gptbot"],
            "",
        )
    )
    data = aggregator.result().to_dict()
    assert data["crawlers"][0]["last_seen"] == "2026-09-01T12:00:00+00:00"


@pytest.mark.parametrize("name", ALL_LOGS)
def test_to_dict_matches_golden_file(name: str) -> None:
    assert report_for(name).to_dict() == load_json(LOGS / f"{name}.expected.json")


@pytest.mark.parametrize("name", ALL_LOGS)
def test_to_dict_matches_golden_file_when_gzipped(name: str, tmp_path: Path) -> None:
    """The golden files are the cross-language contract; a gzipped copy of the
    same fixture (no binary file committed -- built here at test time) must
    aggregate to the exact same report as the plain one."""
    packed = tmp_path / f"{name}.log.gz"
    packed.write_bytes(gzip.compress((LOGS / f"{name}.log").read_bytes()))
    stats = ParseStats()
    aggregator = Aggregator()
    aggregator.add_all(iter_records(packed, stats=stats))
    report = aggregator.result(skipped=stats.skipped)
    assert report.to_dict() == load_json(LOGS / f"{name}.expected.json")


NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("30m", datetime(2026, 9, 28, 11, 30, tzinfo=UTC)),
        ("24h", datetime(2026, 9, 27, 12, 0, tzinfo=UTC)),
        ("7d", datetime(2026, 9, 21, 12, 0, tzinfo=UTC)),
        ("2w", datetime(2026, 9, 14, 12, 0, tzinfo=UTC)),
        ("7D", datetime(2026, 9, 21, 12, 0, tzinfo=UTC)),
        ("2026-09-01", datetime(2026, 9, 1, tzinfo=UTC)),
        ("2026-09-01T10:00:00+02:00", datetime(2026, 9, 1, 8, 0, tzinfo=UTC)),
        ("2026-09-24T00:00:00Z", datetime(2026, 9, 24, 0, 0, tzinfo=UTC)),
        ("2026-09-24T00:00:00z", datetime(2026, 9, 24, 0, 0, tzinfo=UTC)),
    ],
)
def test_parse_since(value: str, expected: datetime) -> None:
    assert parse_since(value, now=NOW) == expected


@pytest.mark.parametrize("value", ["yesterday", "7", "d7", ""])
def test_parse_since_rejects_garbage(value: str) -> None:
    with pytest.raises(ValueError, match="--since"):
        parse_since(value, now=NOW)
