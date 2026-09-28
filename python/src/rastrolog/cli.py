"""rastrolog command line: ``rastrolog parse`` and ``rastrolog check``."""

import enum
import json
import logging
import re
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeRemainingColumn,
)
from rich.table import Table
from rich.text import Text

from rastrolog import __version__
from rastrolog.classify import Match, classify_referrer, classify_user_agent
from rastrolog.formats import Format, UnknownFormatError
from rastrolog.nudge import NUDGE_TEXT, mark_nudged, should_nudge
from rastrolog.parse import ParseStats, iter_records
from rastrolog.render import render_report
from rastrolog.report import Aggregator, parse_since
from rastrolog.theme import THEME, purpose_badge

EXIT_PARTIAL = 1
EXIT_NO_MATCH = 1
EXIT_USAGE = 2

_URL = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://\S+$")

log = logging.getLogger("rastrolog")


class LogFormat(str, enum.Enum):
    combined = "combined"
    cloudfront = "cloudfront"
    alb = "alb"


class Pivot(str, enum.Enum):
    vendor = "vendor"
    page = "page"


app = typer.Typer(
    name="rastrolog",
    add_completion=False,
    rich_markup_mode="rich",
    help="See which AI crawlers read your site and which AI chat products send you visitors.",
)


def _out() -> Console:
    return Console(theme=THEME, highlight=False)


def _err() -> Console:
    return Console(theme=THEME, stderr=True, highlight=False)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    version: Annotated[
        bool, typer.Option("--version", is_eager=True, help="Show the version and exit.")
    ] = False,
) -> None:
    if version:
        typer.echo(f"rastrolog {__version__}")
        raise typer.Exit
    if ctx.invoked_subcommand is None:
        _print_welcome(_out())
        raise typer.Exit


def _print_welcome(console: Console) -> None:
    body = Text.assemble(
        "Which AI crawlers read your site, and which AI chat products send you visitors.\n\n",
        ("  rastrolog parse access.log", "accent"),
        ("                         AI crawlers + AI referrals\n", "muted"),
        ("  rastrolog parse access.log.gz --since 7d --json\n", "accent"),
        ('  rastrolog check "https://chatgpt.com/"', "accent"),
        ("             classify one UA or referrer\n\n", "muted"),
        ("Run ", "muted"),
        ("rastrolog --help", "accent"),
        (" for every option.", "muted"),
    )
    console.print(Panel(body, title="[brand]rastrolog[/]", border_style="accent", expand=False))


def _configure_logging(err: Console, verbose: bool) -> None:
    if not verbose:
        return
    handler = RichHandler(console=err, show_path=False, markup=False, log_time_format="%H:%M:%S")
    log.handlers[:] = [handler]
    log.setLevel(logging.DEBUG)
    log.propagate = False


def _consume(
    path: Path, fmt: Format | None, stats: ParseStats, aggregator: Aggregator, err: Console
) -> None:
    size = path.stat().st_size
    with Progress(
        SpinnerColumn(style="brand"),
        TextColumn("[muted]{task.description}"),
        BarColumn(complete_style="brand", finished_style="ok"),
        DownloadColumn(),
        TimeRemainingColumn(),
        console=err,
        transient=True,
        disable=not err.is_terminal,
    ) as progress:
        task = progress.add_task(path.name, total=size or None)

        def on_progress(done: int) -> None:
            progress.update(task, completed=done)

        aggregator.add_all(iter_records(path, fmt, stats=stats, progress=on_progress))


@app.command()
def parse(
    files: Annotated[
        list[Path], typer.Argument(help="Access logs, plain or gzipped.", show_default=False)
    ],
    log_format: Annotated[
        LogFormat | None, typer.Option("--format", help="Skip auto-detection.")
    ] = None,
    since: Annotated[
        str | None,
        typer.Option(help="Only count requests newer than this: 30m, 24h, 7d, 2w or a date."),
    ] = None,
    top: Annotated[int, typer.Option(min=1, help="How many pages to list.")] = 10,
    by: Annotated[
        Pivot, typer.Option(help="vendor: a row per bot/product. page: a row per page.")
    ] = Pivot.vendor,
    host: Annotated[
        str | None, typer.Option(help="Your site's host, so self-referrals are ignored.")
    ] = None,
    json_output: Annotated[bool, typer.Option("--json", help="Print JSON, not tables.")] = False,
    verbose: Annotated[
        bool, typer.Option("--verbose", "-v", help="Log per-file details to stderr.")
    ] = False,
) -> None:
    """Summarise AI crawler requests and AI referral visits in access logs."""
    out, err = _out(), _err()
    _configure_logging(err, verbose)
    try:
        cutoff = parse_since(since) if since else None
    except ValueError as exc:
        raise typer.BadParameter(str(exc), param_hint="--since") from exc
    for path in files:
        if not path.is_file():
            err.print(f"[err]✗[/] cannot read [bold]{path}[/]: file not found")
            raise typer.Exit(EXIT_USAGE)

    fmt: Format | None = log_format.value if log_format else None
    aggregator = Aggregator(since=cutoff, own_host=host)
    skipped = 0
    truncated = False
    for path in files:
        stats = ParseStats()
        try:
            _consume(path, fmt, stats, aggregator, err)
        except UnknownFormatError as exc:
            err.print(
                Panel(
                    Text(exc.line),
                    title=f"[err]Unrecognised log format[/] in {path}",
                    border_style="err",
                    expand=False,
                )
            )
            err.print("Pass [accent]--format combined|cloudfront|alb[/] if it is one of those.")
            raise typer.Exit(EXIT_USAGE) from None
        except OSError as exc:
            err.print(f"[err]✗[/] cannot read [bold]{path}[/]: {exc.strerror or exc}")
            raise typer.Exit(EXIT_USAGE) from None
        log.debug(
            "parsed %s format=%s records=%d skipped=%d",
            path,
            stats.format,
            stats.records,
            stats.skipped,
        )
        skipped += stats.skipped
        if stats.truncated:
            truncated = True
            err.print(f"[warn]![/] {path} is truncated (gzip ended early); showing what was read.")

    report = aggregator.result(top=top, skipped=skipped)
    if json_output:
        typer.echo(json.dumps(report.to_dict(), indent=2))
    else:
        render_report(out, report, by=by.value, sources=[str(p) for p in files])
        if should_nudge(interactive=out.is_terminal):
            out.print()
            out.print(Text(NUDGE_TEXT, style="muted"))
            mark_nudged()
    if truncated:
        raise typer.Exit(EXIT_PARTIAL)


@app.command()
def check(
    value: Annotated[str, typer.Argument(help="A User-Agent string or a referrer URL.")],
    json_output: Annotated[bool, typer.Option("--json", help="Print JSON.")] = False,
) -> None:
    """Classify one user agent or referrer URL. Exits 1 when nothing matches.

    Treated as a referrer only when the whole value is a URL (a scheme at the
    start, no whitespace anywhere); anything else, including a user agent
    that happens to embed a ``+https://vendor/...`` doc pointer, is classified
    as a user agent.
    """
    match = classify_referrer(value) if _URL.match(value.strip()) else classify_user_agent(value)
    if json_output:
        typer.echo(json.dumps(match.to_dict() if match else None))
    else:
        _print_match(_out(), value, match)
    if match is None:
        raise typer.Exit(EXIT_NO_MATCH)


def _print_match(console: Console, value: str, match: Match | None) -> None:
    if match is None:
        console.print(Text.assemble(("no match  ", "warn"), (value, "muted")))
        return
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="muted")
    grid.add_column()
    if match.kind == "crawler":
        grid.add_row("kind", "AI crawler" if match.ai_specific else "search engine crawler")
        grid.add_row("vendor", match.vendor_name)
        grid.add_row("token", match.token or "")
        grid.add_row("purpose", purpose_badge(match.purpose or ""))
    else:
        grid.add_row("kind", "AI referral")
        grid.add_row("product", match.product or "")
        grid.add_row("vendor", match.vendor_name)
    grid.add_row("id", match.id)
    console.print(Panel(grid, title="[brand]match[/]", border_style="accent", expand=False))
