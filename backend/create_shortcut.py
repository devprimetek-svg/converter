import ctypes
import os
import subprocess
import sys

target_exe = r"C:\Users\Dawood\.gemini\antigravity\scratch\converter\ConverterStudio.exe"
icon_path = r"C:\Users\Dawood\.gemini\antigravity\scratch\converter\app_icon.ico"
desktop = os.path.expanduser(r"~\Desktop")
shortcut_path = os.path.join(desktop, "Converter Studio.lnk")

# Create / Update Desktop Shortcut with custom icon
ps_script = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{target_exe}"
$Shortcut.WorkingDirectory = "{os.path.dirname(target_exe)}"
$Shortcut.IconLocation = "{icon_path},0"
$Shortcut.Description = "Venture Automation - Converter Studio"
$Shortcut.Save()
'''

subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], check=True)
print("Desktop shortcut created successfully with official icon:", shortcut_path)

# Notify Windows Explorer to refresh its icon cache immediately
try:
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0x0000, None, None)  # SHCNE_ASSOCCHANGED
    print("Windows Explorer icon cache refresh signal broadcasted.")
except Exception as e:
    print("Warning sending shell notification:", e)
