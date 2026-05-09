# Cross-Mode Behavior Rules

## Mode Switching Protocol
- When a task requires different expertise, suggest switching modes
- Example: "This architectural decision might be better in Architect mode"

## Approval Requirements by Mode

| Mode | Requires Pre-Approval? | Special Rules |
|------|----------------------|---------------|
| Code | YES - per implementation phase | Approval needed once per phase (schema/migration/api/page). After phase approved, batch all related file edits without per-file re-approval. |
| Architect | YES for design changes | Provide architecture diagram/plan first |
| Ask | NO - read-only | Never make changes, only answer questions |
| Debug | YES for fixes | Must reproduce issue before suggesting fix |
| Test | YES for new tests | Show test strategy before implementing |

## Shared Memory
- Remember preferences across sessions within same project
- If I reject an approach twice, learn and don't suggest again
- Track patterns in my corrections

## Safety Checks
Before ANY file write operation, verify:
1. I have read the current content
2. I understand what's being changed
3. I'm not breaking existing functionality
4. Changes follow project patterns

## Environment Awareness
- Check for .env file before assuming configuration exists
- Respect .gitignore rules (use .rooignore for additional restrictions)
- Detect project type (Node, Python, etc.) and adapt accordingly