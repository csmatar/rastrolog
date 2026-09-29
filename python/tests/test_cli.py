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


def test_unknown_format_path_with_markup_characters_renders_verbatim(
    tmp_path: Path,
) -> None:
    """The full path can contain a ``[/x]``-shaped substring (e.g. a directory
    named ``bad[`` holding a file named ``x].log``) even though no single
    filename component may contain ``/``. Rendering that path must not crash
    with a MarkupError, and must show it verbatim, unescaped."""
    directory = tmp_path / "bad["
    directory.mkdir()
    log = directory / "x].log"
    log.write_text("hello world\n")
    result = runner.invoke(app, ["parse", str(log)])
    assert result.exit_code == 2, result.stderr
    assert "bad[/x].log" in result.stderr
    assert "Unrecognised log format" in result.stderr


def test_missing_file_with_markup_characters_renders_verbatim(tmp_path: Path) -> None:
    missing = tmp_path / "bad[x].log"
    result = runner.invoke(app, ["parse", str(missing)])
    assert result.exit_code == 2
    assert "bad[x].log" in result.stderr


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
    assert "See how to follow changes" not in result.stdout


def test_check_referrer() -> None:
    result = runner.invoke(app, ["check", "https://chatgpt.com/"])
    assert result.exit_code == 0
    assert "ChatGPT" in result.stdout


def test_check_user_agent_json() -> None:
    result = runner.invoke(app, ["check", SAMPLE_UA["claudebot"], "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["id"] == "anthropic-claudebot"


def test_check_user_agent_with_doc_url_json() -> None:
    result = runner.invoke(app, ["check", SAMPLE_UA["gptbot"], "--json"])
    assert result.exit_code == 0
    assert json.loads(result.stdout)["id"] == "openai-gptbot"


def test_check_user_agent_with_doc_url_table() -> None:
    result = runner.invoke(app, ["check", SAMPLE_UA["perplexitybot"]])
    assert result.exit_code == 0
    assert "PerplexityBot" in result.stdout
    assert "AI crawler" in result.stdout


def test_check_no_match_exits_1() -> None:
    result = runner.invoke(app, ["check", "https://www.google.com/"])
    assert result.exit_code == 1
    assert "no match" in result.stdout


def test_check_does_not_crash_on_markup_looking_value() -> None:
    """A value that looks like an unmatched rich closing tag must not crash the
    CLI with a MarkupError; it should just report no match, verbatim."""
    result = runner.invoke(app, ["check", "[/b]"])
    assert result.exit_code == 1
    assert "[/b]" in result.stdout


def test_parse_directory_argument_says_is_a_directory(tmp_path: Path) -> None:
    directory = tmp_path / "logs"
    directory.mkdir()
    result = runner.invoke(app, ["parse", str(directory)])
    assert result.exit_code == 2
    assert "is a directory" in result.stderr
    assert "file not found" not in result.stderr


def test_parse_directory_with_markup_characters_renders_verbatim(tmp_path: Path) -> None:
    directory = tmp_path / "bad[dir]"
    directory.mkdir()
    result = runner.invoke(app, ["parse", str(directory)])
    assert result.exit_code == 2
    assert "bad[dir]" in result.stderr
    assert "is a directory" in result.stderr


def test_check_bare_host_shows_hint() -> None:
    result = runner.invoke(app, ["check", "chatgpt.com"])
    assert result.exit_code == 1
    assert "no match" in result.stdout
    assert 'did you mean "https://chatgpt.com/"?' in result.stdout


def test_check_bare_host_with_trailing_slash_shows_hint() -> None:
    result = runner.invoke(app, ["check", "chatgpt.com/"])
    assert result.exit_code == 1
    assert "no match" in result.stdout
    assert 'did you mean "https://chatgpt.com/"?' in result.stdout


def test_check_user_agent_no_match_has_no_hint() -> None:
    result = runner.invoke(app, ["check", "UnknownBot/1.0"])
    assert result.exit_code == 1
    assert "no match" in result.stdout
    assert "did you mean" not in result.stdout
