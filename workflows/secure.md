# CLAUDE.md — Project Skills & Permissions

---

## Permissions (Allow List)

The following shell commands can be executed **without user confirmation**:

```json
{
  "permissions": {
    "allow": [
      "cat",
      "touch",
      "mkdir",
      "ls",
      "pwd",
      "echo"
    ],
    "deny": [
      "rm -rf",
      "rm -fdr",
      "rm -fr",
      "rmdir"
    ]
  }
}
```

> **Rule:** Read and create operations (`cat`, `touch`, `mkdir`) are auto-approved.
> Destructive delete operations (`rm -rf`, `rm -fdr`) **always** require explicit user confirmation before execution.

---

## Skill 1 — Quality Assurance & Code Review

### Purpose
Ensure the codebase is functionally complete, clean, and free of errors before shipping.

### Checklist

#### Functional Completeness
- [ ] All planned features are implemented and working as expected
- [ ] No placeholder or stub functions left in production code
- [ ] All user flows have been tested end-to-end

#### Code Quality
- [ ] No typos in variable names, function names, comments, or UI-facing strings
- [ ] No rogue characters (e.g. em dashes `—` used instead of hyphens `-`)
- [ ] Consistent naming conventions used throughout (camelCase / snake_case as applicable)
- [ ] No dead/commented-out code left in the codebase
- [ ] No `console.log` or debug print statements in production files

#### Data Exposure
- [ ] No sensitive data (API keys, tokens, secrets, passwords) hardcoded anywhere in the codebase
- [ ] No internal URLs, test credentials, or private identifiers exposed in client-facing code
- [ ] No PII (Personally Identifiable Information) logged or stored insecurely

#### Error Handling
- [ ] All API calls are wrapped in try/catch blocks
- [ ] User-facing error messages are generic (no stack traces or internal details exposed)
- [ ] Edge cases (empty inputs, null values, failed fetches) are handled gracefully

#### Dependencies
- [ ] All imported packages are actually used
- [ ] No known vulnerable packages (check with `npm audit` or equivalent)
- [ ] `package.json` / `requirements.txt` is up to date and accurate

### How to Run This Skill
> Prompt Claude with:
> *"Run the Quality Assurance skill on this codebase. Review all files against the QA checklist and report issues by category."*

---

## Skill 2 — Security & Integrity

### Purpose
Protect the application and its users from abuse, data leaks, and unauthorised access.

### Checklist

#### Secrets Management
- [ ] **No API keys in source code** — all secrets must live in a `.env` file
- [ ] `.env` is listed in `.gitignore` and never committed to version control
- [ ] A `.env.example` file exists with placeholder values (no real secrets)
- [ ] Environment variables are loaded correctly at runtime (e.g. `dotenv` / OS env)

#### Rate Limiting
- [ ] Rate limiting is enabled on all public-facing endpoints, especially AI/chat interfaces
- [ ] Recommended baseline: **max 10–50 messages per 10-minute session** per user/IP
- [ ] Rate limit headers are returned in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)
- [ ] Exceeding the rate limit returns a `429 Too Many Requests` response (not a crash)
- [ ] Limits are configurable via environment variables (not hardcoded)

#### DDoS & Abuse Prevention
- [ ] Bot/automated traffic mitigated via session-based or IP-based rate limiting
- [ ] No unbounded loops or recursive calls that could be exploited for resource exhaustion
- [ ] File upload endpoints (if any) enforce size limits and file type validation

#### Authentication & Authorisation
- [ ] Authenticated routes are properly protected — no bypass via URL manipulation
- [ ] Tokens/sessions expire after a reasonable period of inactivity
- [ ] Admin or internal routes are not publicly accessible

#### Input Validation
- [ ] All user inputs are validated and sanitised before use
- [ ] SQL queries (if applicable) use parameterised statements — no string concatenation
- [ ] No `eval()` or dynamic code execution on user-supplied input

#### Headers & Transport
- [ ] HTTPS enforced in production (no plaintext HTTP)
- [ ] Security headers set: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`
- [ ] CORS policy is restrictive — only trusted origins allowed

### How to Run This Skill
> Prompt Claude with:
> *"Run the Security & Integrity skill on this project. Check all files for exposed secrets, missing rate limiting, and security vulnerabilities. Report findings by severity."*

---

## Quick Reference — Skill Trigger Phrases

| Goal | What to say to Claude |
|---|---|
| Full QA pass | `"Run QA skill — check for typos, dead code, and data exposure"` |
| Security audit | `"Run Security skill — check for exposed keys, rate limiting, and input validation"` |
| Combined pre-ship check | `"Run QA and Security skills. Give me a pre-ship readiness report."` |
| Permission query | `"Check the allow list before running any destructive commands"` |

---

> **Note:** Because AI model responses vary slightly between runs, focus on whether the *issues identified* are correct — not on matching the exact wording of a previous output. The checklist items above are the source of truth.
