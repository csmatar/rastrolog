import gzip
import json
import logging
from pathlib import Path

import pytest
from helpers import LOGS, SAMPLE_UA, load_json
from typer.testing import CliRunner

from rastrolog import __version__
from rastrolog.cli import app

runner = CliRunner()


@pytest.fixture(autouse=True)
def wide_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLUMNS", "200")
    monkeypatch.setenv("NO_COLOR", "1")


@pytest.fixture(autouse=True)
def _reset_rastrolog_logger() -> None:
    """``--verbose`` installs a RichHandler on the shared ``rastrolog`` logger; undo that
    after each test so it doesn't leak into other tests in this or other modules."""
    logger = logging.getLogger("rastrolog")
    handlers, level, propagate = list(logger.handlers), logger.level, logger.propagate
    yield
    logger.handlers[:] = handlers
    logger.setLevel(level)
    logger.propagate = propagate


def test_bare_command_prints_welcome() -> None:
    result = runner.invoke(app, [])
    assert result.exit_code == 0
    assert "rastrolog parse access.log" in result.stdout


def test_version() -> None:
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert result.stdout.strip() == f"rastrolog {__version__}"


def test_parse_prints_tables() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log")])
    assert result.exit_code == 0, result.stderr
    for text in (
        "AI crawlers",
        "GPTBot",
        "AI referrals",
        "ChatGPT",
        "/pricing (2)",
        "skipped 1 malformed line",
    ):
        assert text in result.stdout


def test_parse_json_equals_golden_file() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout) == load_json(LOGS / "nginx.expected.json")


def test_parse_by_page() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--by", "page"])
    assert result.exit_code == 0
    assert "Pages AI tools touch" in result.stdout


def test_parse_mixes_formats_across_files() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), str(LOGS / "alb.log"), "--json"])
    assert result.exit_code == 0
    summary = json.loads(result.stdout)["summary"]
    assert summary["records"] == 28
    assert summary["skipped"] == 2


def test_since_filters() -> None:
    result = runner.invoke(
        app, ["parse", str(LOGS / "nginx.log"), "--since", "2026-09-24", "--json"]
    )
    ids = {row["id"] for row in json.loads(result.stdout)["crawlers"]}
    assert ids == {"perplexity-perplexitybot", "google-googlebot"}


def test_invalid_since_is_a_usage_error() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--since", "yesterday"])
    assert result.exit_code == 2


def test_missing_file_exits_2() -> None:
    result = runner.invoke(app, ["parse", "does-not-exist.log"])
    assert result.exit_code == 2
    assert "file not found" in result.stderr


def test_unknown_format_shows_line_and_hint(tmp_path: Path) -> None:
    log = tmp_path / "weird.log"
    log.write_text("hello world\n")
    result = runner.invoke(app, ["parse", str(log)])
    assert result.exit_code == 2
    assert "Unrecognised log format" in result.stderr
    assert "hello world" in result.stderr
    assert "--format" in result.stderr


def test_explicit_format(tmp_path: Path) -> None:
    log = tmp_path / "mixed.log"
    log.write_text("garbage first line\n" + (LOGS / "nginx.log").read_text())
    result = runner.invoke(app, ["parse", str(log), "--format", "combined", "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["summary"]["skipped"] == 2


def test_truncated_gzip_exits_1_with_partial_report(tmp_path: Path) -> None:
    data = gzip.compress((LOGS / "nginx.log").read_bytes() * 50)
    log = tmp_path / "cut.log.gz"
    log.write_bytes(data[: len(data) // 2])
    result = runner.invoke(app, ["parse", str(log), "--json"])
    assert result.exit_code == 1
    assert "truncated" in result.stderr
    assert json.loads(result.stdout)["summary"]["records"] > 0


def test_verbose_logs_per_file_details_to_stderr() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log"), "--verbose"])
    assert result.exit_code == 0
    assert "format=combined records=14 skipped=1" in result.stderr


def test_no_nudge_when_output_is_not_a_terminal() -> None:
    result = runner.invoke(app, ["parse", str(LOGS / "nginx.log")])
    assert "Get one email" not in result.stdout


def test_check_referrer() -> None:
    result = runner.invoke(app, ["check", "https://chatgpt.com/"])
    assert result.exit_code == 0
    assert "ChatGPT" in result.stdout


def test_check_user_agent_json() -> None:
    result = runner.invoke(app, ["check", SAMPLE_UA["claudebot"], "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["id"] == "anthropic-claudebot"


def test_check_no_match_exits_1() -> None:
    result = runner.invoke(app, ["check", "https://www.google.com/"])
    assert result.exit_code == 1
    assert "no match" in result.stdout
