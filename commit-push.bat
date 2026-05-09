@echo off
setlocal
cd /d "C:\Appdev\HomeBase"

echo === Homebase – Commit and Push ===
echo.

:: Show what will be committed
echo --- Changed files ---
git status --short
echo.

:: Stage all changes
git add -A

:: Commit with message
git commit -m "feat(finance): collapsible income streams + category spend view on budget page

- Income streams section: +/- toggle collapses the list; shows total monthly
  income and stream count as a badge when collapsed so bills are more visible
- Expected costs section: List / By Category toggle added; category view groups
  included rules by finance category, sorted by spend (highest first), with
  expandable drill-down per category and a proportional bar chart
- No schema changes or migrations required (pure UI)"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Commit failed - check output above
    pause
    exit /b 1
)

echo.
echo === Pushing to remote ===
git push

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Push failed - check output above
    pause
    exit /b 1
)

echo.
echo ✓ Committed and pushed successfully
pause
