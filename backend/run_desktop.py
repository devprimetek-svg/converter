"""Standalone Windows Desktop Launcher for Converter Studio.

Starts the FastAPI + React studio locally and opens a native-style Desktop App window.
Works both via Python directly and when compiled into ConverterStudio.exe via PyInstaller.
"""

from __future__ import annotations

import io
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from typing import Callable, Optional

# Ensure sys.stdout and sys.stderr are valid streams when compiled with PyInstaller --noconsole
if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

# Prioritize live source code on disk (if ConverterStudio.exe is in the project folder)
# so any future updates automatically take effect without rebuilding the .exe!
if getattr(sys, "frozen", False):
    _exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    _live_backend = os.path.join(_exe_dir, "backend")
    if os.path.exists(os.path.join(_live_backend, "app", "main.py")):
        sys.path.insert(0, _live_backend)

BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

import uvicorn
from app.main import app


def is_server_healthy(port: int) -> bool:
    """Return True if Converter Studio is already responding on 127.0.0.1:port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def find_available_port(preferred: int = 8000) -> int:
    """Find an available local port starting at preferred."""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return preferred


def open_desktop_window(url: str, on_close: Optional[Callable[[], None]] = None) -> None:
    """Open URL in Chrome/Edge App Mode with isolated profile and auto-shutdown on window close."""
    profile_dir = os.path.join(
        os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
        "ConverterStudio",
        "profile",
    )
    try:
        os.makedirs(profile_dir, exist_ok=True)
    except Exception:
        pass

    browser_candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ]

    proc = None
    for exe_path in browser_candidates:
        if os.path.exists(exe_path):
            try:
                proc = subprocess.Popen([
                    exe_path,
                    f"--user-data-dir={profile_dir}",
                    f"--app={url}",
                    "--start-maximized",
                    "--no-first-run",
                    "--no-default-browser-check",
                ])
                break
            except Exception:
                pass

    if proc is None:
        webbrowser.open(url)
        return

    if on_close:
        def wait_exit():
            try:
                proc.wait()
            except Exception:
                pass
            on_close()

        threading.Thread(target=wait_exit, daemon=True).start()


def main() -> None:
    port = 8000
    url = f"http://127.0.0.1:{port}"

    # If already running on port 8000, just open the window
    if is_server_healthy(port):
        open_desktop_window(url)
        return

    port = find_available_port(8000)
    url = f"http://127.0.0.1:{port}"

    def on_window_closed():
        # Cleanly terminate backend server when desktop window is closed
        time.sleep(0.5)
        os._exit(0)

    def wait_and_launch_browser():
        for _ in range(50):
            if is_server_healthy(port):
                open_desktop_window(url, on_close=on_window_closed)
                return
            time.sleep(0.2)
        open_desktop_window(url, on_close=on_window_closed)

    threading.Thread(target=wait_and_launch_browser, daemon=True).start()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_config=None,
    )


if __name__ == "__main__":
    main()
