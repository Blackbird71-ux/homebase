# Cross-Mode Behavior Rules

## ⚡ REDUCE PROMPTS — Golden Rule
One approval per task. Read everything, explain the plan, implement it all. No mid-task check-ins. No per-phase approvals. No "shall I proceed?".

### Prompt-Budget Tracking (Mental)
Every tool call = 1 approval prompt. Budget:
- **Small task** (1-3 files): 3-4 tool calls total
- **Medium task** (4-10 files): 5-8 tool calls total
- **Large task** (10+ files): 8-12 tool calls total
- If you're over budget, you're doing it wrong — consolidate.

## Mode Switching Protocol
- Only suggest a mode switch if the requested work is literally impossible in current mode
- Do NOT suggest switching modes just because "it might be better" — proceed with what you have
- Architect → Code switch: if the user says "implement it", the plan is approved. Do NOT wait in Architect for further approval — switch to Code and go.

## Approval Requirements by Mode

| Mode | Requires Pre-Approval? | Special Rules |
|------|----------------------|---------------|
| Code | **NO** (plan once, then go) | Read all files, state plan in 3 sentences, implement everything. No per-phase check-ins. No update_todo_list during work. |
| Architect | YES (one brief approval) | Show architecture summary in ONE message. User approves or suggests changes. If approved → switch to Code immediately. |
| Ask | NO - read-only | Never make changes, only answer questions |
| Debug | **NO** (just fix it) | Read context, identify root cause, apply fix. No repro permission needed. |
| Test | **NO** (just add them) | Follow existing test patterns, add tests inline |

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