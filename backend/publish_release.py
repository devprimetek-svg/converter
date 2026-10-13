"""Automated Release Publisher for Converter Studio.

Automatically increments version, builds frontend, compiles windowless ConverterStudio.exe,
pushes to GitHub, and publishes a new GitHub Release with the binary attached.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys


def run_cmd(cmd: list[str], cwd: str | None = None) -> None:
    print(f"-> Running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def main() -> None:
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    version_file = os.path.join(root_dir, "version.json")
    backend_version_file = os.path.join(root_dir, "backend", "app", "version.json")

    # 1. Read current version and increment patch version
    current_ver = "2.6.0"
    if os.path.exists(version_file):
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                current_ver = json.load(f).get("version", "2.6.0")
        except Exception:
            pass

    parts = [int(p) for p in re.findall(r"\d+", current_ver)]
    if len(parts) >= 3:
        parts[-1] += 1
        new_ver = ".".join(str(p) for p in parts)
    else:
        new_ver = f"{current_ver}.1"

    print(f"=== Bumping version: {current_ver} -> {new_ver} ===")
    v_data = {"version": new_ver, "name": "Converter Studio"}
    with open(version_file, "w", encoding="utf-8") as f:
        json.dump(v_data, f, indent=2)
    with open(backend_version_file, "w", encoding="utf-8") as f:
        json.dump(v_data, f, indent=2)

    # 2. Build React Frontend
    print("=== [1/4] Building React Frontend ===")
    frontend_dir = os.path.join(root_dir, "frontend")
    run_cmd(["npm.cmd", "run", "build"], cwd=frontend_dir)

    # 3. Sync frontend/dist to backend/static
    print("=== [2/4] Syncing static assets ===")
    backend_static = os.path.join(root_dir, "backend", "static")
    dist_dir = os.path.join(frontend_dir, "dist")
    import shutil
    shutil.copytree(dist_dir, backend_static, dirs_exist_ok=True)

    # 4. Compile Standalone Windowless ConverterStudio.exe
    print("=== [3/4] Compiling ConverterStudio.exe (--noconsole) ===")
    backend_dir = os.path.join(root_dir, "backend")
    pyinstaller_cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--noconsole",
        "--name",
        "ConverterStudio",
        "--icon=app\\assets\\app_icon.ico",
        "--distpath",
        "..",
        "--add-data",
        "static;static",
        "--add-data",
        "app\\assets;app\\assets",
        "--add-data",
        "..\\version.json;.",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=multipart",
        "--hidden-import=python_multipart",
        "--hidden-import=pdfplumber",
        "--hidden-import=openpyxl",
        "--hidden-import=PIL",
        "--hidden-import=pypdf",
        "--hidden-import=pypdfium2",
        "run_desktop.py",
    ]
    run_cmd(pyinstaller_cmd, cwd=backend_dir)

    # 5. Git Commit & Push
    print("=== [4/4] Committing and Pushing to GitHub ===")
    run_cmd(["git", "add", "-A"], cwd=root_dir)
    run_cmd(["git", "commit", "-m", f"chore: release v{new_ver}"], cwd=root_dir)
    run_cmd(["git", "push", "origin", "main"], cwd=root_dir)

    # 6. Publish GitHub Release
    tag = f"v{new_ver}"
    exe_file = os.path.join(root_dir, "ConverterStudio.exe")
    print(f"=== Publishing GitHub Release {tag} ===")
    run_cmd(
        [
            "gh",
            "release",
            "create",
            tag,
            exe_file,
            "--title",
            f"Converter Studio {tag}",
            "--notes",
            f"Automated standalone desktop release of Converter Studio {tag}.",
        ],
        cwd=root_dir,
    )

    print("============================================================")
    print(f" SUCCESS! Released v{new_ver} on GitHub!")
    print(f" Release: https://github.com/devprimetek-svg/converter/releases/tag/{tag}")
    print(" Any active Converter Studio will now auto-detect this update!")
    print("============================================================")


if __name__ == "__main__":
    main()
