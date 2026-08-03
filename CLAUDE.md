# Agent Instructions

You operate inside the **WAT framework** — Workflows, Agents, Tools. This separation keeps the system reliable: AI handles reasoning and coordination, while deterministic code handles execution.

---

## The Three Layers

**Workflows — the instructions**
Markdown SOPs stored in `workflows/`. Each one defines an objective, required inputs, which tools to use, expected outputs, and how to handle edge cases. Written in plain language, the same way you'd brief a capable team member.

**Agents — the decision-maker (you)**
Your responsibility is intelligent coordination. Read the relevant workflow, run tools in the right sequence, recover from failures gracefully, and ask clarifying questions when something is unclear. You connect intent to execution — you don't try to do everything yourself.
- Example: If you need to pull data from a website, don't attempt it directly. Read `workflows/scrape_website.md`, identify the required inputs, then run `tools/scrape_single_site.py`.

**Tools — the execution layer**
Python scripts in `tools/` that do the actual work: API calls, data transformations, file operations, database queries. Credentials and API keys live in `.env`. These scripts are consistent, testable, and fast.

**Why this structure works:** When AI handles every step directly, accuracy compounds downward fast. Five steps at 90% accuracy each leaves you at 59% overall success. Offloading execution to deterministic scripts keeps you focused on orchestration and decision-making — where you perform best.

---

## How to Operate

**1. Check for existing tools first**
Before writing anything new, scan `tools/` for what your workflow needs. Only build new scripts when nothing exists for the task.

**2. Learn from failures, don't just recover from them**
When something breaks:
- Read the full error message and trace
- Fix the script and retest (if it uses paid API calls or credits, check with me before rerunning)
- Update the workflow with what you learned — rate limits, timing quirks, unexpected behaviour
- Example: You hit a rate limit, dig into the docs, find a batch endpoint, refactor the tool to use it, verify it works, then update the workflow so it never trips the same way again

**3. Keep workflows current**
When you find a better method, discover a constraint, or hit a recurring issue, update the workflow. That said, never create or overwrite workflows without asking unless explicitly told to. These are your standing instructions — preserve and refine them, don't discard them after a single use.

---

## Starting a New Project

Before doing anything on a new build, read `workflows/planning_phase.md`.

This covers how to set up the project, write the brief, define the architecture, lock in the tech stack, and get to an approved plan before any code is touched. Follow it in sequence.

Only move into execution once the plan has been reviewed and approved.

---

## The Self-Improvement Loop

Every failure is an opportunity to make the system more robust:
1. Identify what broke
2. Fix the tool
3. Verify the fix works
4. Update the workflow with the improved approach
5. Continue with a stronger system

---

## File Structure

**Where things live:**
- **Deliverables** — final outputs go to cloud services (Google Sheets, Slides, etc.) where they're directly accessible
- **Intermediates** — temporary processing files that can be regenerated at any time

**Directory layout:**
```
.tmp/                         # Temporary files — scraped data, intermediate exports. Disposable.
tools/                        # Python scripts for deterministic execution
workflows/                    # Markdown SOPs defining objectives and steps
.env                          # API keys and environment variables — NEVER store secrets anywhere else
credentials.json, token.json  # Google OAuth (gitignored)
```

Local files are for processing only. Anything that needs to be seen or used downstream lives in cloud services. Everything in `.tmp/` is disposable.

---

## The Short Version

You sit between what I want (workflows) and what actually gets done (tools). Read the instructions, make smart decisions, call the right tools, recover from errors, and keep improving the system as you go.

Stay pragmatic. Stay reliable. Keep learning.
