"""Charm-inspired look for the CLI (the lipgloss palette), built on rich."""

from __future__ import annotations

from rich.text import Text
from rich.theme import Theme

PINK = "#F25D94"
PURPLE = "#7D56F4"
GREEN = "#04B575"
YELLOW = "#ECC94B"
GREY = "#767676"
RED = "#FF5F87"

PURPOSE_LABELS = {
    "training": "training",
    "user_fetch": "user fetch",
    "search_index": "search index",
}

THEME = Theme(
    {
        "brand": f"bold {PINK}",
        "accent": PURPLE,
        "ok": GREEN,
        "warn": YELLOW,
        "err": f"bold {RED}",
        "muted": GREY,
        "count": "bold",
        "badge.training": f"bold reverse {PINK}",
        "badge.user_fetch": f"bold reverse {GREEN}",
        "badge.search_index": f"bold reverse {PURPLE}",
        "badge.other": f"reverse {GREY}",
    }
)


def purpose_badge(purpose: str) -> Text:
    """A small coloured pill: `` training ``, `` user fetch ``, `` search index ``."""
    if purpose in PURPOSE_LABELS:
        return Text(f" {PURPOSE_LABELS[purpose]} ", style=f"badge.{purpose}")
    return Text(f" {purpose} ", style="badge.other")
