# Project rules for Claude

## Core principle
- Solve problems in the simplest working way first.
- Avoid overengineering. Prefer clarity over abstraction.
- If uncertain, inspect codebase instead of guessing.

---

## Workflow

### 1. Understand before changing anything
- Read relevant files first.
- Trace existing patterns in the codebase.
- Do NOT introduce new architecture unless explicitly needed.

### 2. Plan when necessary
- If task affects multiple modules → outline plan first.
- If task is small and local → skip planning and implement directly.

### 3. Implementation rules
- Keep changes minimal and localized.
- Do not refactor unrelated code.
- Match existing project style, even if it's not ideal.

---

## Code style

- Follow existing formatting and naming conventions.
- Prefer readable code over clever code.
- No unnecessary abstractions.
- Avoid deep inheritance chains.
- Keep functions small and single-purpose.

---

## Testing

- Run relevant tests after changes.
- If tests don’t exist, validate manually via reproduction steps.
- Do not assume code works without verification.

---

## Git workflow

- Do not commit unless explicitly asked.
- Commit messages should be clear and descriptive.
- One logical change per commit.

---

## Tool usage

- Prefer CLI tools (git, npm, docker, etc.) over manual edits where appropriate.
- Use repository tools instead of reinventing logic.

---

## Safety rules

- Never delete files without confirming necessity.
- Never modify secrets or env configs unless instructed.
- Do not touch production configs blindly.

---

## Anti-patterns (strict)

- ❌ Do not over-engineer solutions
- ❌ Do not create new frameworks inside the project
- ❌ Do not rewrite working code “for cleanliness”
- ❌ Do not assume missing context — investigate it
- ❌ Do not batch unrelated changes together

---

## Context handling

- If session becomes noisy → simplify assumptions and re-check files.
- If unsure → ask or inspect, don’t guess.
