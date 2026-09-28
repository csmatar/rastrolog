"""Rich tables for a Report. Presentation only: no parsing or classification here."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from rich import box
from rich.console import Console
from rich.table import Table
from rich.text import Text

from rastrolog.report import Report
from rastrolog.theme import purpose_badge

TOP_PAGES_IN_CELL = 3


def _when(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%d %H:%M")


def _pages(pages: Sequence[tuple[str, int]]) -> Text:
    """Render as a Text, never a plain str: paths come straight from the log and
    must not be parsed as rich markup (a path can legitimately contain ``[`` or
    ``]``, e.g. ``/blog/[slug]-8f2c.js``)."""
    if not pages:
        return Text("–")
    cell = Text()
    for i, (path, count) in enumerate(pages[:TOP_PAGES_IN_CELL]):
        if i:
            cell.append("\n")
        cell.append(path)
        cell.append(f" ({count})")
    return cell


def _pairs(pairs: Sequence[tuple[str, int]]) -> str:
    return ", ".join(f"{name} {count}" for name, count in pairs) or "–"


def _table(title: str, *, muted: bool = False) -> Table:
    return Table(
        title=title,
        title_style="muted" if muted else "brand",
        title_justify="left",
        box=box.ROUNDED,
        border_style="muted" if muted else "accent",
        header_style="bold",
        style="muted" if muted else "",
    )


def crawler_table(report: Report) -> Table | None:
    rows = [r for r in report.crawlers if r.ai_specific]
    if not rows:
        return None
    table = _table("AI crawlers")
    table.add_column("Vendor")
    table.add_column("Token", style="bold")
    table.add_column("Purpose")
    table.add_column("Requests", justify="right", style="count")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen", style="muted")
    table.add_column("Top pages")
    for r in rows:
        table.add_row(
            r.vendor_name,
            r.token,
            purpose_badge(r.purpose),
            f"{r.requests:,}",
            f"{r.unique_pages:,}",
            _when(r.last_seen),
            _pages(r.top_pages),
        )
    return table


def search_engine_table(report: Report) -> Table | None:
    rows = [r for r in report.crawlers if not r.ai_specific]
    if not rows:
        return None
    table = _table("Search engines (for comparison)", muted=True)
    table.add_column("Vendor")
    table.add_column("Token")
    table.add_column("Requests", justify="right")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen")
    for r in rows:
        table.add_row(
            r.vendor_name, r.token, f"{r.requests:,}", f"{r.unique_pages:,}", _when(r.last_seen)
        )
    return table


def referral_table(report: Report) -> Table | None:
    if not report.referrals:
        return None
    table = _table("AI referrals")
    table.add_column("Product", style="bold")
    table.add_column("Vendor")
    table.add_column("Visits", justify="right", style="count")
    table.add_column("Pages", justify="right")
    table.add_column("Last seen", style="muted")
    table.add_column("Top landing pages")
    for r in report.referrals:
        table.add_row(
            r.product,
            r.vendor_name,
            f"{r.visits:,}",
            f"{r.unique_pages:,}",
            _when(r.last_seen),
            _pages(r.top_pages),
        )
    return table


def page_table(report: Report) -> Table | None:
    if not report.pages:
        return None
    table = _table("Pages AI tools touch")
    table.add_column("Page", style="bold")
    table.add_column("Crawler requests", justify="right", style="count")
    table.add_column("Referral visits", justify="right", style="count")
    table.add_column("Crawlers")
    table.add_column("Referrals")
    for p in report.pages:
        table.add_row(
            Text(p.path),
            f"{p.crawler_requests:,}",
            f"{p.referral_visits:,}",
            _pairs(p.crawlers),
            _pairs(p.referrals),
        )
    return table


def summary_line(report: Report) -> Text:
    parts: list[tuple[str, str]] = [
        (f"{report.records:,}", "count"),
        (" requests · ", "muted"),
        (f"{report.ai_crawler_requests:,}", "count"),
        (" from AI crawlers · ", "muted"),
        (f"{report.ai_referral_visits:,}", "count"),
        (" AI referral visits", "muted"),
    ]
    if report.skipped:
        plural = "" if report.skipped == 1 else "s"
        parts += [(" · ", "muted"), (f"skipped {report.skipped:,} malformed line{plural}", "warn")]
    return Text.assemble(*parts)


def _print_or_empty(console: Console, table: Table | None, empty_message: str) -> None:
    if table is None:
        console.print(Text(empty_message, style="muted"))
    else:
        console.print(table)


def render_report(
    console: Console, report: Report, *, by: str = "vendor", sources: Sequence[str] = ()
) -> None:
    console.print(Text.assemble(("rastrolog", "brand"), "  ", (", ".join(sources), "muted")))
    console.print()
    if by == "page":
        _print_or_empty(console, page_table(report), "No AI crawler or AI referral traffic found.")
    else:
        _print_or_empty(console, crawler_table(report), "No AI crawlers found.")
        console.print()
        _print_or_empty(console, referral_table(report), "No AI referrals found.")
        engines = search_engine_table(report)
        if engines is not None:
            console.print()
            console.print(engines)
    console.print()
    console.print(summary_line(report))
