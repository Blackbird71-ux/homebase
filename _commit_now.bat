@echo off
cd /d "C:\Appdev\HomeBase"

echo === Staging all changes ===
git add -A

echo.
echo === Changed files ===
git status --short

echo.
echo === Committing ===
git commit -m "feat(finance): entities tab, bill attachments inline, budget UX

- Add /finance/entities page: full CRUD for FinanceEntity (name, type,
  colour picker, description, sort order, default flag, reactivate)
- Add Entities nav tab to finance layout (between Vendors and Members)
- Update entities API GET to accept ?includeInactive=true
- Remove entity management modal from Budget page; replace Add Entity
  button with a Manage entities link to the new tab
- Income streams now collapsed by default on Budget page
- Bill attachment panel now renders inline directly below each bill row
  instead of floating above the list; eye/preview icon now always visible
  when an attachment exists (PDF iframe or image inline toggle)
- Remove unused addYears import from entities route
- No schema changes or migrations required"

echo.
echo === Pushing to origin master ===
git push origin master

echo.
echo === Done ===
