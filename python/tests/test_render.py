from datetime import datetime, timezone

from helpers import report_for
from rich.console import Console
from rich.table import Table

from rastrolog.render import (
    crawler_table,
    page_table,
    referral_table,
    render_report,
    search_engine_table,
    summary_line,
)
from rastrolog.report import CrawlerRow, PageRow, Report
from rastrolog.theme import THEME, purpose_badge

UTC = timezone.utc


def _render(report: Report, **kwargs: object) -> str:
    console = Console(record=True, width=200, theme=THEME, color_system=None)
    render_report(console, report, **kwargs)  # type: ignore[arg-type]
    return console.export_text()


def test_vendor_view_shows_both_tables_and_search_engines() -> None:
    text = _render(report_for("nginx"), sources=["nginx.log"])
    assert "AI crawlers" in text
    assert "GPTBot" in text
    assert "training" in text
    assert "/docs (2)" in text
    assert "AI referrals" in text
    assert "ChatGPT" in text
    assert "/pricing (2)" in text
    assert "Search engines (for comparison)" in text
    assert "Googlebot" in text
    assert "nginx.log" in text


def test_page_view() -> None:
    text = _render(report_for("nginx"), by="page")
    assert "Pages AI tools touch" in text
    assert "/docs" in text
    assert "GPTBot 2" in text
    assert "Perplexity 1" in text


def test_empty_report_shows_friendly_messages() -> None:
    empty = Report(records=3, skipped=0, crawlers=(), referrals=(), pages=())
    text = _render(empty)
    assert "No AI crawlers found." in text
    assert "No AI referrals found." in text


def test_summary_mentions_skipped_lines_with_correct_plural() -> None:
    report = report_for("nginx")
    assert "skipped 1 malformed line" in summary_line(report).plain
    assert "malformed lines" not in summary_line(report).plain


def test_purpose_badge_labels() -> None:
    assert purpose_badge("user_fetch").plain.strip() == "user fetch"
    assert purpose_badge("something_new").plain.strip() == "something_new"


def test_top_pages_with_markup_looking_paths_render_verbatim() -> None:
    """Page paths come straight from the log and must never be parsed as rich
    markup: a real Next.js route like ``/blog/[slug]-8f2c.js`` must show its
    brackets, and a path containing ``[/b]`` must not crash with MarkupError."""
    crawler = CrawlerRow(
        id="openai-gptbot",
        vendor="openai",
        vendor_name="OpenAI",
        token="GPTBot",
        purpose="training",
        ai_specific=True,
        requests=2,
        unique_pages=2,
        last_seen=datetime(2026, 9, 22, tzinfo=UTC),
        top_pages=(
            ("/_next/static/chunks/pages/blog/[slug]-8f2c.js", 1),
            ("/x[/b]y", 1),
        ),
    )
    report = Report(records=2, skipped=0, crawlers=(crawler,), referrals=(), pages=())
    text = _render(report)
    assert "/_next/static/chunks/pages/blog/[slug]-8f2c.js (1)" in text
    assert "/x[/b]y (1)" in text


def test_page_view_paths_with_markup_looking_paths_render_verbatim() -> None:
    page = PageRow(
        path="/_next/static/chunks/pages/blog/[slug]-8f2c.js",
        crawler_requests=1,
        referral_visits=0,
        crawlers=(("GPTBot", 1),),
        referrals=(),
    )
    report = Report(records=1, skipped=0, crawlers=(), referrals=(), pages=(page,))
    text = _render(report, by="page")
    assert "/_next/static/chunks/pages/blog/[slug]-8f2c.js" in text


def _lines(table: Table | None, width: int = 200) -> list[str]:
    assert table is not None
    console = Console(record=True, width=width, theme=THEME, color_system=None)
    console.print(table)
    return console.export_text().splitlines()


def _row_separators(lines: list[str]) -> int:
    """Separator lines inside the table body (the header separator counts too)."""
    return sum(1 for line in lines if line.lstrip().startswith("├"))


def test_page_view_never_splits_a_name_from_its_count() -> None:
    crawlers = (
        ("ClaudeBot", 77),
        ("GPTBot", 76),
        ("Bytespider", 24),
        ("PerplexityBot", 21),
        ("ChatGPT-User", 19),
        ("meta-externalagent", 18),
    )
    referrals = (("ChatGPT", 33), ("Claude", 11))
    page = PageRow(
        path="/docs/getting-started",
        crawler_requests=235,
        referral_visits=44,
        crawlers=crawlers,
        referrals=referrals,
    )
    report = Report(records=279, skipped=0, crawlers=(), referrals=(), pages=(page,))
    lines = _lines(page_table(report), width=100)
    for name, count in crawlers + referrals:
        assert any(f"{name} {count}" in line for line in lines), f"{name} {count} was split"


def test_multi_line_tables_separate_their_rows() -> None:
    report = report_for("nginx")
    ai_crawlers = [r for r in report.crawlers if r.ai_specific]
    # header separator + one separator between each pair of rows
    assert _row_separators(_lines(crawler_table(report))) == len(ai_crawlers)
    assert _row_separators(_lines(referral_table(report))) == len(report.referrals)
    assert _row_separators(_lines(page_table(report))) == len(report.pages)


def test_search_engine_table_stays_compact() -> None:
    assert _row_separators(_lines(search_engine_table(report_for("nginx")))) == 1
