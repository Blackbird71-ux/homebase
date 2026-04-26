\# AI Agent Instructions — VS Code App Building

\## 🔍 Before You Start
1\. \*\*Audit the existing codebase first.\*\*

&#x20;  - Review the folder structure, entry points, existing components, routes, and data models.

&#x20;  - Read `package.json` / `requirements.txt` / `pyproject.toml` to understand dependencies.

&#x20;  - Check for a `.env.example` or config file to understand environment variables in use.

&#x20;  - Identify the project's coding style (linting config, formatter, naming conventions).


2\. \*\*Design before building.\*\*

&#x20;  - Summarise what already exists that's relevant to the task.

&#x20;  - Propose your implementation plan and the files you intend to create or modify.

&#x20;  - Wait for confirmation before proceeding.

we use the build file dockerfile, docker-compose.yml and docker-entrypoint.sh as we build on windows and deploy on nas to these need to be included in planning, documentation and implementation.

\---

\## 🛠️ During Development



\### General

\- Keep it all as simple and focussed as possible while acheiving the objective do not overthink and go down a rabbit hole.

\- Work carefully and thoroughly with \*\*no regressions\*\*.

\- \*\*Only modify files directly related to the task.\*\* Do not refactor unrelated code.

\- Maintain all existing functionality — do not break what already works.

\- Ensure \*\*backward compatibility\*\* if modifying existing functions, APIs, or data schemas.

\- Match the project's existing \*\*error handling patterns\*\* (e.g. try/catch, toast notifications, logging strategy).

\- Do \*\*not hardcode secrets or API keys\*\* — use environment variables and `.env` files.

\- Before adding a new dependency, check if an existing library already covers the need.


\### Performance \& Quality
\- Avoid blocking the main thread; use async/await, lazy loading, or workers where appropriate.

\- Handle all UI states: \*\*loading, error, empty, and success\*\*.

\- Run the project's linter and formatter before finishing (e.g. `eslint`, `prettier`, `ruff`, `black`).


\### Accessibility
\- New UI elements must include proper labels, ARIA attributes, and keyboard navigation support.

\- Maintain sufficient colour contrast (WCAG AA minimum).


\### Security
\- Never log or expose sensitive data.

\- Sanitise user inputs; validate on both client and server.

\- Follow the project's existing auth/permission patterns for any new routes or actions.


\---


\## 🤖 Sub-Agent Workflow
\- Deploy sub-agents in parallel to speed up work where tasks are independent.

\- Each sub-agent must \*\*check back\*\* before merging their output into the main codebase.

\- Sub-agents must run tests and confirm their module is working before reporting complete.

\- The orchestrating agent performs a final \*\*integration test\*\* after all sub-agents finish.


\---


\## ✅ Testing

\- Test all new code paths, including edge cases.

\- \*\*Test for existing users\*\* — ensure no breaking changes to current workflows or data.

\- Verify the feature works across relevant environments (dev, staging, prod config).

\- Confirm the build succeeds with no errors or warnings introduced by your changes.

\---


\## 🖥️ UI / UX
\- Ensure the UI is updated so users can discover and use every feature you implement.

\- New UI elements should match the existing design system (components, spacing, typography, colours).

\- Include loading indicators and meaningful error messages for async operations.



\---

\## 🌿 Git \& Worktrees
\- Use descriptive commit messages that explain \*what\* and \*why\*.

\- Do not mix unrelated changes in a single commit.

\- \*\*Update all relevant worktrees\*\* when finished.

\- Note which files were changed and why in the completion summary.



\---

\## 🏁 Completion
1\. Run a final check: linter, formatter, and all tests passing.

2\. Verify no unintended files were modified.

3\. Use `attempt\_completion` with a clear summary of:

&#x20;  - What was implemented

&#x20;  - Files created or modified

&#x20;  - How to test the new functionality

&#x20;  - Any known limitations or follow-up recommendations

4\. \*\*Create a summary Markdown file\*\* and save it to the `/docs` directory.


\---


\## 🔁 Rollback Notes
\- Before starting, note the current state of any files you plan to modify.

\- If something breaks in production, document what to revert.

\- Prefer feature flags for large or risky changes so they can be toggled off without a deploy.


\---

\*Last updated: April 2026\*

