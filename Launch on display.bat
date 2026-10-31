@echo off
title Office Assistant - Launch on display
echo.
echo   Launching Office Assistant on Office Display (192.168.1.33)...
echo.

set "APP_URL=https://manaly94.github.io/office-assistant/receiver/"

chromecast-webdriver-cli --hostname=192.168.1.33 --url="%APP_URL%"
if errorlevel 1 (
    echo.
    echo   [!] Launch failed. Is the display on and on the same Wi-Fi?
    echo       Try waking it: it may be asleep after a power cycle.
) else (
    echo.
    echo   [OK] Office Assistant is running on the display.
)

echo.
pause
