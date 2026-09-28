"""One-time pointer to change notifications, shown after the first table report.

Never shown with --json, when stdout is not a terminal, or when
RASTROLOG_NO_NUDGE is set to any non-empty value. A marker file in the user
config directory makes sure it is shown at most once per machine.
"""

from __future__ import annotations

import contextlib
import os
import sys
from collections.abc import Mapping
from pathlib import Path

NUDGE_URL = "https://github.com/csmatar/rastrolog#get-notified-when-the-list-changes"
NUDGE_TEXT = (
    f"New AI bots show up every few months. See how to follow changes to the list: {NUDGE_URL}"
)
OPT_OUT_ENV = "RASTROLOG_NO_NUDGE"
#: Versioned so a later release (e.g. once the email signup launches) can show
#: one more nudge to people who already saw this one, by bumping the number.
_MARKER = "nudged-1"


def config_dir(
    env: Mapping[str, str] | None = None,
    platform: str | None = None,
    home: Path | None = None,
) -> Path:
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = Path.home() if home is None else home
    if platform == "win32":
        base = Path(env["APPDATA"]) if env.get("APPDATA") else home / "AppData" / "Roaming"
    elif platform == "darwin":
        base = home / "Library" / "Application Support"
    else:
        base = Path(env["XDG_CONFIG_HOME"]) if env.get("XDG_CONFIG_HOME") else home / ".config"
    return base / "rastrolog"


def should_nudge(
    *,
    interactive: bool,
    env: Mapping[str, str] | None = None,
    directory: Path | None = None,
) -> bool:
    env = os.environ if env is None else env
    if not interactive or env.get(OPT_OUT_ENV):
        return False
    return not ((directory or config_dir(env)) / _MARKER).exists()


def mark_nudged(directory: Path | None = None) -> None:
    target = directory or config_dir()
    # A read-only home or a sandbox just means the line may show again: harmless.
    with contextlib.suppress(OSError):
        target.mkdir(parents=True, exist_ok=True)
        (target / _MARKER).touch()
