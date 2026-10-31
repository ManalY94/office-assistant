@echo off
title Office Assistant - Stop app
echo.
echo   Stopping Office Assistant on Office Display...
echo.
chromecast-webdriver-cli --hostname=192.168.1.33 --home
if errorlevel 1 (
    echo   [!] Could not stop the app.
) else (
    echo   [OK] Returned to the display's home screen.
)
echo.
pause
