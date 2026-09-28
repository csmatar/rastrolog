import gzip
from pathlib import Path

import pytest
from helpers import LOGS, SAMPLE_UA

from rastrolog.formats import UnknownFormatError
from rastrolog.parse import ParseStats, iter_records

LINE = '203.0.113.7 - - [28/Sep/2026:12:00:00 +0000] "GET /docs HTTP/1.1" 200 10 "-" "{ua}"'


@pytest.mark.parametrize(
    ("name", "fmt"),
    [("nginx", "combined"), ("apache", "combined"), ("cloudfront", "cloudfront"), ("alb", "alb")],
)
def test_fixture_logs_parse(name: str, fmt: str) -> None:
    stats = ParseStats()
    records = list(iter_records(LOGS / f"{name}.log", stats=stats))
    assert stats.format == fmt
    assert (stats.records, stats.skipped, len(records)) == (14, 1, 14)
    assert records[-1].ua.count('"') in (0, 2)  # ALB fixture swaps quotes for apostrophes


def test_gzip_is_detected_by_magic_bytes_not_extension(tmp_path: Path) -> None:
    packed = tmp_path / "access.log"  # no .gz suffix on purpose
    packed.write_bytes(gzip.compress((LOGS / "nginx.log").read_bytes()))
    plain = list(iter_records(LOGS / "nginx.log"))
    assert list(iter_records(packed)) == plain


def test_truncated_gzip_is_flagged(tmp_path: Path) -> None:
    data = gzip.compress((LOGS / "nginx.log").read_bytes() * 50)
    cut = tmp_path / "cut.log.gz"
    cut.write_bytes(data[: len(data) // 2])
    stats = ParseStats()
    records = list(iter_records(cut, stats=stats))
    assert stats.truncated
    assert 0 < len(records) < 14 * 50


def test_unknown_format_raises(tmp_path: Path) -> None:
    log = tmp_path / "x.log"
    log.write_text("hello world\nmore text\n")
    with pytest.raises(UnknownFormatError):
        list(iter_records(log))


def test_explicit_format_skips_detection(tmp_path: Path) -> None:
    log = tmp_path / "x.log"
    log.write_text("garbage\n" + LINE.format(ua=SAMPLE_UA["gptbot"]) + "\n")
    stats = ParseStats()
    records = list(iter_records(log, "combined", stats=stats))
    assert (len(records), stats.skipped) == (1, 1)


def test_empty_file(tmp_path: Path) -> None:
    log = tmp_path / "empty.log"
    log.write_text("\n\n")
    stats = ParseStats()
    assert list(iter_records(log, stats=stats)) == []
    assert stats.format is None


def test_crlf_and_blank_lines(tmp_path: Path) -> None:
    log = tmp_path / "win.log"
    line = LINE.format(ua=SAMPLE_UA["gptbot"])
    log.write_bytes(f"{line}\r\n\r\n{line}\r\n".encode())
    stats = ParseStats()
    records = list(iter_records(log, stats=stats))
    assert len(records) == 2
    assert stats.skipped == 0
    assert records[0].ua == SAMPLE_UA["gptbot"]


def test_invalid_utf8_bytes_are_replaced(tmp_path: Path) -> None:
    log = tmp_path / "bytes.log"
    log.write_bytes(LINE.format(ua="Agent \udcff").encode("utf-8", "surrogateescape") + b"\n")
    records = list(iter_records(log))
    assert len(records) == 1
    assert "�" in records[0].ua


def test_progress_ends_at_file_size(tmp_path: Path) -> None:
    log = tmp_path / "big.log"
    log.write_text((LINE.format(ua=SAMPLE_UA["gptbot"]) + "\n") * 5000)
    seen: list[int] = []
    list(iter_records(log, progress=seen.append))
    assert len(seen) >= 2
    assert seen == sorted(seen)
    assert seen[-1] == log.stat().st_size
