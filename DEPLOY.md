# Deploying and maintaining the QuotaSuccess site

You don't need to know web development to use this guide — it's written as a set of exact steps. Skim the headings, jump to the one you need.

## How the site is put together (the short version)

- The website itself is plain HTML/CSS/JavaScript in `site/` — no build step, no framework. What you see in `site/index.html` is exactly what gets published.
- It's hosted on **Netlify**, connected to this project's git repository. Every time changes are pushed to the `main` branch, Netlify automatically rebuilds and republishes the site within a minute or two. There is nothing to click "deploy" on — pushing to git *is* the deploy.
- Form submissions go to `netlify/functions/submit-lead.js`, a small serverless function that saves the lead to **Supabase** (the database) and emails you a notification via **Resend**.
- The admin dashboard (`site/admin.html`) reads leads straight out of Supabase using your own login.

## 1. How to push a change live

1. Make your edit (or have it made) to the files in this project.
2. Commit the change to git and push it to `main`, e.g.:
   ```
   git add -A
   git commit -m "Describe what changed"
   git push
   ```
3. Open the Netlify dashboard for this site → the **Deploys** tab. You'll see a new deploy start automatically, usually finishing in under two minutes. Once it says "Published," the change is live.
4. If a deploy ever fails, the Deploys tab shows the build log — for this site, failures are almost always a typo in `netlify.toml` or a JavaScript syntax error, both readable directly in the log.

## 2. Environment variables (secrets)

These live in the **Netlify dashboard → Site configuration → Environment variables** — never in the git repository, never in a file that gets committed. `.env.example` in this project lists every variable the site uses, with a comment explaining each one, but it intentionally contains no real values.

Required for the lead form to work at all:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional, for email notifications (see step 4 below for how to get these):
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_TO`

Optional, to change the rate limit:
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES`

After changing an environment variable in the Netlify dashboard, trigger a new deploy (Deploys tab → "Trigger deploy" → "Deploy site") so the function picks up the new value.

## 3. Previewing changes locally before pushing (optional)

If you install the [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`), you can preview the site with the real form/function behaviour on your own machine:

1. Copy `.env.example` to `.env` and fill in real values (get them from the Netlify dashboard's environment variables, or from Supabase directly for the two Supabase ones).
2. Run `netlify dev` from the project root.
3. Open the local URL it prints (usually `http://localhost:8888`) and click around — form submissions here write to the *real* Supabase database, so use a test email address.

This step is entirely optional — you can also just push to git and check the live Netlify preview/production URL.

## 4. Setting up Resend (email notifications)

Resend sends the "someone just submitted the form" email to `robbie@quotasuccess.com.au`. It does **not** touch your existing mailbox at all — it only sends outward; you keep reading and replying to email exactly as you do today.

1. Sign up at [resend.com](https://resend.com) (free tier covers this site's volume comfortably).
2. In Resend, go to **Domains → Add Domain** and enter `quotasuccess.com.au`.
3. Resend will show you 2–3 DNS records to add (typically an SPF `TXT` record and one or two DKIM `CNAME` records). Add these wherever `quotasuccess.com.au`'s DNS is managed — check your Netlify DNS panel first, since that's the most likely place given your email was purchased through Netlify. Each DNS provider's interface looks different, but the pattern is always: add a record of the given type, with the given name/host and the given value, exactly as Resend shows them.
4. Wait for Resend to show the domain as "Verified" (usually a few minutes to a few hours, depending on DNS propagation).
5. In Resend, create an **API key**.
6. In the Netlify dashboard, add three environment variables:
   - `RESEND_API_KEY` = the key from step 5
   - `RESEND_FROM` = `QuotaSuccess Leads <leads@quotasuccess.com.au>` (any address on the verified domain works)
   - `RESEND_TO` = `robbie@quotasuccess.com.au`
7. Trigger a new deploy. Submit a test lead on the live site and confirm the email arrives — replying to it should go straight to the person who submitted the form (the notification sets Reply-To to their email automatically).

If these three variables aren't set, the site still works exactly as before — leads just aren't emailed, only saved to Supabase.

## 5. Making a future database change

Any change to the `leads` table structure (adding a column, changing a rule) is called a **migration**. To keep things simple and safe:

1. Describe the change you want in plain language (e.g. "I want to capture which city the visitor is in").
2. That gets turned into a small SQL statement and applied to the Supabase project, and `supabase/schema.sql` in this repo gets updated to match — that file is always the current, readable source of truth for what the database looks like, even though the live database is the one actually running.
3. If the form itself needs a new field to collect that data, `site/index.html`, `site/js/main.js` and `netlify/functions/submit-lead.js` are updated together, then pushed live per step 1.

You never need to touch the database by hand for this — it's always done through a migration, which is logged and reversible.

## 6. If you ever need to move to a different Supabase project

This shouldn't come up often, but if it ever does (e.g. moving to a new Supabase organisation):

1. Create the new Supabase project.
2. Run the entire contents of `supabase/schema.sql` against it (Supabase dashboard → SQL Editor → paste and run) — this recreates the `leads` and `lead_submission_attempts` tables, the security rules, and the admin read policy exactly as they exist today.
3. In the Netlify dashboard, update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the new project's values (Supabase dashboard → Project Settings → API).
4. In `site/js/admin.js`, update the two constants at the top (`SUPABASE_URL` and `SUPABASE_ANON_KEY`) to the new project's values, commit, and push.
5. Recreate your admin login in the new project (see `ADMIN.md`).
6. Trigger a new Netlify deploy.

Old leads don't move automatically — if you need the history carried over, that's a one-off data export/import from the old project's table editor, done once at cutover.
