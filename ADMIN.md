# Using the admin dashboard

The admin dashboard at `/admin.html` on your live site (e.g. `https://quotasuccess.com.au/admin.html`) shows every lead-capture and self-assessment submission in a searchable table, without needing to open Supabase directly.

## How it's kept private

This page isn't listed anywhere in the site's navigation, and it's marked so search engines won't index it — but **that's not what actually protects the data**. The real protection is a database rule (in Supabase, called "row-level security" or RLS): the `leads`, `sign_responses` and `assessment_responses` tables only allow read access to someone logged in as `robbie@quotasuccess.com.au`. Anyone else — including someone who guesses the `/admin.html` URL — gets an empty result, not your data, even without a login form at all. Those rules live in `supabase/schema.sql` and are already applied to the live database.

You'll notice `site/js/admin.js` contains a long key (the Supabase "anon" key). That's meant to be public — every Supabase project's anon key is designed to be safely visible in a browser. It only identifies *which* Supabase project to talk to; it grants no access on its own. Access comes from the RLS rule above, combined with actually being logged in.

## One-time setup: creating your login

You only need to do this once (or again if you ever forget the password):

1. Go to [supabase.com](https://supabase.com) and open the QuotaSuccess project (`gbcttmrgvbjcsxvlbwfi`).
2. In the left sidebar, click **Authentication** → **Users**.
3. Click **Add user** → **Create new user**.
4. Email: `robbie@quotasuccess.com.au` (this must match exactly — it's what the security rule checks against).
5. Password: choose a strong password. Supabase doesn't email it anywhere, so store it in your password manager now.
6. Leave "Auto Confirm User" turned on (so you can log in immediately without an email confirmation step).
7. Click **Create user**.

That's it — no code changes needed, no redeploy needed. You can log in immediately.

**To reset the password later:** in the same Authentication → Users screen, click on your user, and there's a "Send password recovery" or "Reset password" option, or you can just delete and recreate the user with a new password.

## One more one-time setup step: enabling Delete

The database originally only let your login *read* the data, not remove it. To turn on the Delete button in the dashboard:

1. Go to the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste and run:
   ```sql
   create policy "admin can delete leads" on leads
     for delete to authenticated
     using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');

   create policy "admin can delete sign_responses" on sign_responses
     for delete to authenticated
     using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');

   create policy "admin can delete assessment_responses" on assessment_responses
     for delete to authenticated
     using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');
   ```
3. That's it — no redeploy needed, the Delete button works immediately once these run. (`supabase/schema.sql` in the repo already reflects this as the source of truth, so a brand-new project set up from that file in future won't need this extra step.)

Until you run this, clicking Delete will fail with a clear error rather than silently doing nothing.

## Using the dashboard day-to-day

1. Go to `/admin.html` on the live site.
2. Sign in with the email and password from setup.
3. You'll see a table of every submission, newest first: date, source (general enquiry vs. self-assessment), email, company, role, what they said they're interested in, their PACE "block" (if they completed the assessment), which of the 24 "Signs" questions they selected (click "N selected" to expand the list, showing only the ones they picked), and — for a completed self-assessment — every one of the 16 individual questions with its exact answer (click "16 answers" to expand: e.g. "[Convert] Our forecast is built on tracked lead and lag measures, not gut feel. — Ad hoc (2/5)"). Nothing about a submission is only available as a rolled-up summary; the full detail behind every score is there if you want it.
4. Use the two dropdown filters at the top to narrow the list — by source, or by which service they're interested in. This is the fastest way to see, for example, only the people who said they want the "Fractional" service.
5. Click **Download CSV** to export exactly what's currently on screen (it respects the two filters — filter to "Fractional" first if you only want those). Opens straight in Excel/Sheets; the Signs and assessment-answer columns are the same detail as the expandable lists, just flattened into one cell each.
6. Click **Delete** on a row to remove that submission permanently. You'll get a confirmation popup naming the email first — there's no undo after that, so read it before confirming. Deleting a lead also removes its Signs and assessment-answer detail automatically (they're stored as child rows tied to it).
7. Click **Refresh** to pull in anything submitted since you opened the page.
8. Click **Sign out** when you're done, especially on a shared or public computer — the session isn't saved anywhere, so closing the browser tab also effectively signs you out.

## If something looks wrong

- **"Your session has expired"**: sessions last about an hour. Just sign in again.
- **Table is empty but you know leads exist**: check the two filter dropdowns aren't accidentally narrowing the list; click "All sources" / "All interests".
- **Can't sign in at all**: double-check the email is exactly `robbie@quotasuccess.com.au` (the security rule is an exact match) and that you're using the password from Supabase, not any other account.
- You always have the email notification (once Resend is set up — see `DEPLOY.md`) and the Supabase dashboard's own **Table Editor** (Database → Tables → `leads`) as a fallback way to see the same data.
