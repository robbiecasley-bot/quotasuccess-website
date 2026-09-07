# QuotaSuccess keep-alive check

Prevents the Supabase project (`gbcttmrgvbjcsxvlbwfi`) from auto-pausing due to
inactivity, and self-heals it if it does anyway.

## Why this exists, and why it's a Windows Scheduled Task and not a cloud Routine

An earlier attempt used a cloud-hosted scheduled Routine (Claude Code's
`RemoteTrigger`/`/schedule` mechanism). It looked correctly configured and
reported `SUCCEEDED` on its own run history, but every actual run silently
failed at the network layer: the cloud sandbox's egress policy blocked
outbound access to `quotasuccess.com.au` entirely
(`connect_rejected — organization policy`), so it never once reached the
site or the database. Nothing surfaced that failure until Supabase itself
emailed a pause notice, weeks later.

This machine's own network has no such restriction (confirmed with a plain
`curl` before this was set up), so the same job runs here instead, via
Windows Task Scheduler.

## What's here

- `keepalive-check-prompt.txt` — the exact prompt sent to Claude each run.
  Edit this file directly to change what the check does; no need to touch
  the scheduled task itself.
- `run-keepalive-check.ps1` — reads the prompt file and runs
  `claude -p` non-interactively (`--permission-mode bypassPermissions`,
  since there's no terminal here to approve a tool-use prompt), appending
  the result to `keepalive-logs/keepalive-check.log`.
- `run-keepalive-check.bat` — a one-line launcher that just calls the
  `.ps1` file. Exists only because `schtasks /create` choked on the nested
  quoting needed to point `/tr` at a `.ps1` path containing spaces; pointing
  it at this `.bat` instead sidesteps that entirely.
- `keepalive-logs/` — not committed (see `.gitignore`). Grows over time;
  safe to delete or trim the log file at any point.

## The registered task

```
schtasks /create /tn "QuotaSuccess Keep-Alive Check" /tr "<path>\run-keepalive-check.bat" /sc weekly /d MON,THU /st 19:00 /f
```

Runs every Monday and Thursday at **7:00pm local time** (Windows resolves
this against the machine's own timezone, currently `AUS Eastern Standard
Time`, which auto-adjusts for AEDT in October — the requested `09:00 UTC`
holds through daylight saving without needing to touch this).

**Two real limitations, not theoretical ones:**
- **Logon Mode: Interactive only.** The task will not run if you're logged
  out at 7pm on the day, even if the machine is powered on. If this needs
  to survive that, it has to be reconfigured to "run whether user is logged
  on or not," which requires storing Windows credentials for the task —
  ask if you want that instead.
- **Power management:** configured to not start on battery and to stop if
  it switches to battery mid-run. If this machine is regularly on battery
  at the scheduled time, the check won't fire.

## Checking on it

- `schtasks /query /tn "QuotaSuccess Keep-Alive Check" /v /fo list` — full
  status, last result, next run time.
- `Get-Content ".\scripts\keepalive-logs\keepalive-check.log" -Tail 50` —
  what the last few runs actually reported.
- Run it manually any time: `powershell -File ".\scripts\run-keepalive-check.ps1"`
  (from a normal terminal — Claude Code sessions are blocked from doing this
  themselves, since a session spawning another `claude -p` process is
  flagged as a self-invocation pattern by the safety classifier).

## The old cloud Routine

`trig_019j3mak1c5nqh73PqJE2xKY` ("QuotaSuccess keep-alive check") still
exists but has been disabled — it can't be deleted via the API, only
disabled or re-enabled at https://claude.ai/code/routines. It's kept around
disabled rather than left running uselessly every 3 days.
