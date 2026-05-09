# Global Development Preferences

## Universal Rules (Applies to Every Interaction)

### Investigation First
- Never make changes without understanding the full context first
- Read relevant files, understand dependencies, check for side effects
- If uncertain about something, ask for clarification

### Summary Before Action
- Provide ONE structured summary per implementation phase (not per file edit):
  1. **Investigation findings** (what you discovered)
  2. **Proposed changes** (specific files and modifications)
  3. **Rationale** (why this approach)
  4. **Risks or considerations** (what could go wrong)
- Do NOT re-summarize before every individual edit within an approved phase

### Quality Over Speed
- Reject "quick fixes" - always implement proper solutions
- No technical debt shortcuts
- If a quick fix is tempting, explain why the proper fix is better

### Data Persistence First
- Default assumption: data lives outside containers
- Use host-mounted volumes for files
- Use persistent databases with external storage
- Flag any ephemeral data storage as a warning

### Configuration Over Hard-Coding
- Default to configurable settings
- If hard-coding seems necessary, explain why
- Suggest settings page options when adding new functionality

## Code Quality Standards

### Batching for Fewer Approvals
- Read ALL needed files in parallel (single batch of read_file calls)
- Make ALL related edits in as few apply_diff calls as possible (use multiple SEARCH/REPLACE blocks per call)
- Run build/verify ONCE at end of each phase, not after every individual change
- Do NOT ask "shall I proceed?" between edits within an approved phase

### Style & Polish
- Modern, clean, professional appearance
- Consistent formatting with project standards
- Responsive design for UI work
- Smooth interactions and proper loading states

### Documentation
- Comments explain "why", not "what"
- Update README when adding significant features
- Document environment variables in .env.example

### Error Handling
- Graceful degradation
- User-friendly error messages
- Proper logging for debugging
- Never expose internal errors to end users

## Communication Style

### When I Ask Questions
- Be thorough but concise
- Provide examples when helpful
- If my approach has flaws, explain why gently

### When You Have Suggestions
- Start with "May I suggest..." or "Consider this alternative..."
- Explain trade-offs (pros/cons)
- Show code examples for better alternatives

### When You Need More Info
- Ask specific questions
- Suggest what information would help
- Don't make assumptions without validation

## Project Context Hints
- Check for existing patterns before creating new ones
- Respect existing architecture decisions
- If something seems outdated, suggest modernization with migration path