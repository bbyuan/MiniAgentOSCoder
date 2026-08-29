from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys


class NativeDialogUnavailable(RuntimeError):
    pass


def choose_local_directory() -> Path | None:
    command = _directory_picker_command()
    completed = subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return None

    selected = completed.stdout.strip()
    if not selected:
        return None
    path = Path(selected).expanduser().resolve()
    return path if path.is_dir() else None


def _directory_picker_command() -> list[str]:
    if sys.platform == "darwin":
        return [
            "osascript",
            "-e",
            'POSIX path of (choose folder with prompt "Choose a code project")',
        ]

    if sys.platform == "win32":
        return [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                "if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath } else { exit 1 }"
            ),
        ]

    if shutil.which("zenity"):
        return ["zenity", "--file-selection", "--directory", "--title=Choose a code project"]
    if shutil.which("kdialog"):
        return ["kdialog", "--getexistingdirectory", str(Path.home())]
    raise NativeDialogUnavailable("No supported system folder picker is installed")
