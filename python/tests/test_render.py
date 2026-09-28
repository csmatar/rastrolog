from helpers import report_for
from rich.console import Console

from rastrolog.render import render_report, summary_line
from rastrolog.report import Report
from rastrolog.theme import THEME, purpose_badge


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
