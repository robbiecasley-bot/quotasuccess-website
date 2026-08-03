# Planning Phase

Follow this checklist at the start of every new build. Complete each section in order before writing any code.

---

## ⚙️ Setup

- [ ] Create a new project folder and open it in your IDE
- [ ] Switch Claude Code to **Plan Mode** — bottom left button in the Claude chat interface
- [ ] Set the model to **Opus** for anything technically complex

---

## 📝 Write the Brief

- [ ] State the goal in plain English — what is being built and why
- [ ] Reference a comparable existing tool if it helps — e.g. *"like Panda Doc but simpler"*
- [ ] Use a voice transcript tool to capture the brief quickly — spoken language is faster than typing
- [ ] Don't over-polish the format — get everything out first, refine later
- [ ] Attach any reference files, templates, or PDFs the build should be based on

---

## 🎯 Goal & Constraints

- [ ] Write the goal in one sentence
- [ ] List every file or system Claude needs to be aware of
- [ ] Define constraints — what should NOT be touched or changed
- [ ] Write verification steps — how will success be confirmed?
- [ ] Structure every build prompt using this format:

```
Goal:
Relevant files/systems:
Constraints:
Expected output:
Verification steps:
```

---

## 🏗️ Project Architecture

Answer each of these before build begins:

- [ ] **UI** — what does the user see and interact with?
- [ ] **Workflow/orchestration** — what steps run automatically?
- [ ] **Business logic** — what decisions does the system make?
- [ ] **Data access** — what gets stored, retrieved, or transformed?
- [ ] **External integrations** — which APIs or third-party tools are involved?

---

## 🔧 Tech Stack

- [ ] Front-end framework — or specify *"recommend the best option"*
- [ ] Database — e.g. Supabase
- [ ] CSS/styling — e.g. Tailwind
- [ ] Auth/login — is user authentication needed?
- [ ] Payments — e.g. Stripe; fixed or variable pricing?
- [ ] Deployment target — e.g. Netlify, Vercel

---

## 🤝 Clarifying Questions

- [ ] Let Claude ask questions back — one at a time
- [ ] Answer every question before moving forward — don't skip
- [ ] Keep going back and forth until the plan feels complete and nothing is ambiguous

---

## 📄 CLAUDE.md Setup

- [ ] Add the project purpose — what this workspace is for
- [ ] Add a folder map — what lives where
- [ ] Add install, dev, test, build, and deploy commands
- [ ] Add code style and architecture rules
- [ ] Add libraries to use or avoid
- [ ] Add "do not touch" rules — files that require explicit permission before editing
- [ ] Add a definition of done — what counts as complete
- [ ] Keep it short — a long file nobody reads defeats the purpose

---

## ✅ Review & Approve

- [ ] Read the full implementation plan Claude produces
- [ ] Confirm the user flows make sense
- [ ] Confirm the tech stack is reasonable — you don't need to understand every detail
- [ ] Make all changes in the **plan document**, not in the code
- [ ] Verify you can: inspect files, run commands, edit files, run tests, and roll back with Git
- [ ] Only move to the Build phase once fully satisfied
- [ ] Switch Claude Code to **Edit Automatically** to begin execution
