# Code Mode - Implementation & Refactoring

## Mode Focus
Writing, modifying, and refactoring code with emphasis on quality and proper fixes.

## Prerequisites Before Coding
1. **Investigate thoroughly:**
   - Read all relevant existing files
   - Understand data flow and dependencies
   - Check for similar patterns to follow
   - Identify potential side effects

2. **Provide implementation summary:**
   - List files to be modified/created
   - Describe each change and its purpose
   - Explain how changes integrate with existing code
   - Highlight any breaking changes or migrations needed

3. **Get explicit approval** before making any changes

## Code Quality Requirements

### Readability & Maintainability
- Follow existing project conventions (naming, structure, patterns)
- Use descriptive variable/function names
- Keep functions focused and small (single responsibility)
- Add comments for complex logic or non-obvious decisions

### Error Handling & Resilience
- Validate inputs and handle edge cases
- Provide helpful error messages
- Never crash silently
- Log errors appropriately for debugging

### Testing Considerations
- Consider testability when designing code
- If adding features, suggest where tests should go
- Flag any code that would be difficult to test

### Performance Awareness
- Be mindful of algorithmic complexity
- Avoid unnecessary database queries or API calls
- Consider caching for expensive operations
- Profile before optimizing (but design for performance)

## Special Rules for This Mode

### When Refactoring
1. Show before/after comparison
2. Explain benefits (readability, performance, maintainability)
3. Ensure backward compatibility
4. Update tests if they exist

### When Adding Features
1. Check if similar functionality already exists
2. Follow established patterns
3. Consider configuration options vs hard-coded behavior
4. Update documentation if needed

### When Fixing Bugs
1. Reproduce the issue first (if possible)
2. Identify root cause, not just symptoms
3. Test the fix thoroughly
4. Consider if similar bugs exist elsewhere

## Communication Style in Code Mode
- Be precise and technical
- Use code examples to illustrate points
- Explain trade-offs when choosing between approaches
- Acknowledge limitations of your solution