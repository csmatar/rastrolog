"""Stream LogRecords from a file, plain or gzip, in constant memory."""

from __future__ import annotations

import gzip
import io
import zlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import IO, cast

from rastrolog.formats import (
    Format,
    LineParser,
    LogRecord,
    MalformedLineError,
    detect,
    make_parser,
)

GZIP_MAGIC = b"\x1f\x8b"
PROGRESS_EVERY = 2000  # lines between progress callbacks


@dataclass(slots=True)
class ParseStats:
    format: Format | None = None
    lines: int = 0
    records: int = 0
    skipped: int = 0
    truncated: bool = False


def iter_records(
    path: Path,
    fmt: Format | None = None,
    *,
    stats: ParseStats | None = None,
    progress: Callable[[int], None] | None = None,
) -> Iterator[LogRecord]:
    """Yield records from ``path``; fill ``stats`` as it goes.

    gzip is detected by magic bytes, not by extension. Invalid UTF-8 bytes are
    replaced, CRLF is normalised, blank lines are ignored. ``progress`` receives
    on-disk bytes read so far (compressed bytes for gzip) so a bar can use the
    file size as its total. Raises UnknownFormatError when ``fmt`` is None and the
    first non-empty line matches no format. A cut-off gzip ends iteration early
    and sets ``stats.truncated``.
    """
    st = stats if stats is not None else ParseStats()
    with path.open("rb") as raw:
        magic = raw.read(2)
        raw.seek(0)
        stream: IO[bytes] = (
            cast("IO[bytes]", gzip.GzipFile(fileobj=raw, mode="rb")) if magic == GZIP_MAGIC else raw
        )
        text = io.TextIOWrapper(stream, encoding="utf-8", errors="replace", newline=None)
        parser: LineParser | None = None
        try:
            for line in text:
                st.lines += 1
                if progress is not None and st.lines % PROGRESS_EVERY == 0:
                    progress(raw.tell())
                line = line.rstrip("\n")
                if not line.strip():
                    continue
                if parser is None:
                    st.format = fmt or detect(line)
                    parser = make_parser(st.format)
                try:
                    record = parser.parse(line)
                except MalformedLineError:
                    st.skipped += 1
                    continue
                if record is not None:
                    st.records += 1
                    yield record
        except (EOFError, gzip.BadGzipFile, zlib.error):
            st.truncated = True
        if progress is not None:
            progress(raw.tell())
