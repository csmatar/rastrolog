import time
from pathlib import Path

import pytest
from helpers import LOGS

from rastrolog.formats import CombinedParser, MalformedLineError
from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator


def _valid_lines() -> list[str]:
    parser = CombinedParser()
    lines = []
    for line in (LOGS / "nginx.log").read_text().splitlines():
        try:
            parser.parse(line)
        except MalformedLineError:
            continue
        lines.append(line)
    return lines


@pytest.mark.perf
def test_one_million_lines_parse_in_under_ten_seconds(tmp_path: Path) -> None:
    lines = _valid_lines()
    path = tmp_path / "big.log"
    with path.open("w", encoding="utf-8") as fh:
        for i in range(1_000_000):
            fh.write(lines[i % len(lines)] + "\n")
    stats = ParseStats()
    aggregator = Aggregator()
    start = time.perf_counter()
    aggregator.add_all(iter_records(path, stats=stats))
    aggregator.result()
    elapsed = time.perf_counter() - start
    assert stats.records == 1_000_000
    assert elapsed < 10, f"1M lines took {elapsed:.1f}s"
