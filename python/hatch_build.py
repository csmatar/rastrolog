"""Bundle the repo-root signals.json into the wheel.

Building from a git checkout, the canonical file is ../signals.json.
Building from an sdist, the sdist force-include already placed it at
src/rastrolog/signals.json, so there is nothing to add.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class SignalsBuildHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            return  # dev installs read the repo-root file directly (see rastrolog/signals.py)
        root_signals = Path(self.root).parent / "signals.json"
        if root_signals.is_file():
            build_data["force_include"][str(root_signals)] = "rastrolog/signals.json"
            return
        if not (Path(self.root) / "src" / "rastrolog" / "signals.json").is_file():
            msg = "signals.json not found at the repo root or in src/rastrolog/"
            raise FileNotFoundError(msg)
