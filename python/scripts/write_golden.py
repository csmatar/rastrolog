"""Regenerate conformance/logs/*.expected.json from the Python implementation.

Run it after an intentional behaviour change and review the diff before
committing. The golden files are also the contract for the TypeScript parser
in js/core (Epic 2/3), so an unreviewed change here breaks parity.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from rastrolog.parse import ParseStats, iter_records
from rastrolog.report import Aggregator

LOGS = Path(__file__).resolve().parents[2] / "conformance" / "logs"


def main() -> int:
    for log in sorted(LOGS.glob("*.log")):
        stats = ParseStats()
        aggregator = Aggregator()
        aggregator.add_all(iter_records(log, stats=stats))
        report = aggregator.result(top=10, skipped=stats.skipped)
        target = log.with_suffix(".expected.json")
        target.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")
        print(f"wrote {target.relative_to(LOGS.parents[1])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
