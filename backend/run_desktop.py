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
import tempfile
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

import json
import uvicorn
from app.main import app


def get_remote_web_url() -> Optional[str]:
    """Check if a remote central web app URL is configured via environment or app_config.json."""
    env_url = os.environ.get("CONVERTER_STUDIO_URL")
    if env_url:
        return env_url.strip().rstrip("/")

    exe_dir = (
        os.path.dirname(os.path.abspath(sys.executable))
        if getattr(sys, "frozen", False)
        else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )

    candidates = [
        os.path.join(exe_dir, "app_config.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_config.json"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app_config.json"),
        os.path.join(getattr(sys, "_MEIPASS", ""), "app_config.json"),
    ]

    for c in candidates:
        if c and os.path.exists(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    val = cfg.get("web_app_url") or cfg.get("server_url")
                    if val and isinstance(val, str) and val.strip().startswith("http"):
                        return val.strip().rstrip("/")
            except Exception:
                pass
    return None


def is_remote_healthy(remote_url: str) -> bool:
    """Check if the remote central web app is reachable within 2.5 seconds."""
    try:
        req = urllib.request.Request(
            f"{remote_url}/api/health",
            headers={"User-Agent": "ConverterStudio-Desktop"},
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            return resp.status in (200, 204)
    except Exception:
        try:
            req = urllib.request.Request(
                remote_url,
                headers={"User-Agent": "ConverterStudio-Desktop"},
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                return resp.status in (200, 204, 301, 302)
        except Exception:
            return False


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


def get_app_profile_dir() -> str:
    """Return an isolated profile directory for Converter Studio App Window."""
    base_dir = os.path.join(
        os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
        "ConverterStudio",
        "app_profile",
    )
    lock_file = os.path.join(base_dir, "lockfile")
    if os.path.exists(lock_file):
        try:
            os.remove(lock_file)
        except Exception:
            # Fallback to a per-PID profile if currently held by another active window
            fallback = os.path.join(tempfile.gettempdir(), f"ConverterStudio_Profile_{os.getpid()}")
            os.makedirs(fallback, exist_ok=True)
            return fallback

    os.makedirs(base_dir, exist_ok=True)
    return base_dir


def open_desktop_window(url: str, on_close: Optional[Callable[[], None]] = None) -> None:
    """Open URL in dedicated App Mode (native-style desktop window)."""
    profile_dir = get_app_profile_dir()

    # Prioritize Microsoft Edge (default on this Windows server), then Google Chrome
    browser_candidates = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
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
    # 1. Dual-Mode: Check if a remote Cloud Web App is configured (e.g. Render.com URL)
    remote_url = get_remote_web_url()
    if remote_url:
        if is_remote_healthy(remote_url):
            # Remote cloud web app is healthy & reachable!
            # Any updates deployed on Render will instantly reflect here without downloading a new .exe!
            open_desktop_window(remote_url, on_close=lambda: os._exit(0))
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
            return
        # If remote is offline or unreachable, fall back smoothly to local offline server below

    # 2. Local Mode / Offline Fallback
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
