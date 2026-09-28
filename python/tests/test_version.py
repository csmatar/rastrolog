from importlib.metadata import version

import rastrolog


def test_version_matches_installed_distribution() -> None:
    assert rastrolog.__version__ == version("rastrolog")
