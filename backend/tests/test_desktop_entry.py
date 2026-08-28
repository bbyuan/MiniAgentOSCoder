from pathlib import Path
import sys

import pytest

import desktop_entry
from app.runtime.paths import default_agent_dir


def test_daemon_port_validates_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MINIAGENTOS_PORT", "43121")
    assert desktop_entry.daemon_port() == 43121

    monkeypatch.setenv("MINIAGENTOS_PORT", "outside")
    with pytest.raises(RuntimeError, match="integer"):
        desktop_entry.daemon_port()

    monkeypatch.setenv("MINIAGENTOS_PORT", "70000")
    with pytest.raises(RuntimeError, match="between"):
        desktop_entry.daemon_port()


def test_desktop_entry_forces_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setenv("MINIAGENTOS_PORT", "43122")
    monkeypatch.setattr(desktop_entry.uvicorn, "run", lambda application, **options: captured.update(options))

    desktop_entry.main()

    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 43122
    assert captured["access_log"] is False


def test_default_agent_dir_supports_source_environment_and_bundle(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source = default_agent_dir()
    assert (source / "config.yaml").is_file()

    configured = tmp_path / "configured-agent"
    monkeypatch.setenv("MINIAGENTOS_DEFAULT_AGENT_DIR", str(configured))
    assert default_agent_dir() == configured

    monkeypatch.delenv("MINIAGENTOS_DEFAULT_AGENT_DIR")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path / "bundle"), raising=False)
    assert default_agent_dir() == tmp_path / "bundle" / ".agent"
