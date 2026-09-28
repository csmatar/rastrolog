from pathlib import Path

import pytest

from rastrolog.nudge import NUDGE_TEXT, NUDGE_URL, config_dir, mark_nudged, should_nudge


def test_config_dir_per_platform(tmp_path: Path) -> None:
    home = tmp_path / "home"
    assert config_dir({}, "linux", home) == home / ".config" / "rastrolog"
    assert config_dir({"XDG_CONFIG_HOME": "/xdg"}, "linux", home) == Path("/xdg/rastrolog")
    assert config_dir({}, "darwin", home) == home / "Library" / "Application Support" / "rastrolog"
    assert config_dir({"APPDATA": "C:/Users/a/AppData/Roaming"}, "win32", home) == Path(
        "C:/Users/a/AppData/Roaming/rastrolog"
    )
    assert config_dir({}, "win32", home) == home / "AppData" / "Roaming" / "rastrolog"


def test_nudge_shows_once(tmp_path: Path) -> None:
    assert should_nudge(interactive=True, env={}, directory=tmp_path)
    mark_nudged(tmp_path)
    assert not should_nudge(interactive=True, env={}, directory=tmp_path)


def test_no_nudge_when_not_interactive(tmp_path: Path) -> None:
    assert not should_nudge(interactive=False, env={}, directory=tmp_path)


def test_opt_out_env(tmp_path: Path) -> None:
    assert not should_nudge(interactive=True, env={"RASTROLOG_NO_NUDGE": "1"}, directory=tmp_path)


def test_mark_nudged_survives_unwritable_directory(tmp_path: Path) -> None:
    blocker = tmp_path / "file"
    blocker.write_text("not a directory")
    mark_nudged(blocker / "rastrolog")  # parent is a file: mkdir fails, must not raise


def test_text_points_at_the_notification_anchor() -> None:
    assert NUDGE_URL.endswith("#get-notified-when-the-list-changes")
    assert NUDGE_URL in NUDGE_TEXT


@pytest.mark.parametrize("value", ["1", "true", "yes"])
def test_any_non_empty_opt_out_value(tmp_path: Path, value: str) -> None:
    assert not should_nudge(interactive=True, env={"RASTROLOG_NO_NUDGE": value}, directory=tmp_path)
