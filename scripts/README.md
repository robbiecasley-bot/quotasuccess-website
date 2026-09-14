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
- `run-keepalive-check.ps1` — pipes the prompt file to `claude -p` via
  **stdin** (`--permission-mode bypassPermissions`, since there's no
  terminal here to approve a tool-use prompt), appending the result to
  `keepalive-logs/keepalive-check.log`. The prompt is piped rather than
  passed as a CLI argument because a real run on 2026-09-14 proved that a
  long argument full of embedded double quotes gets mangled — truncated and
  corrupted — by Windows/PowerShell's native command-line parsing. Stdin
  sidesteps that entirely. `Write-Log` also writes with `-Encoding UTF8`
  explicitly, since `Add-Content`'s default in Windows PowerShell 5.1 is the
  system ANSI codepage, which otherwise corrupts non-ASCII characters
  (em dashes, curly quotes) in claude.exe's UTF-8 output.
- `run-keepalive-check.bat` — a one-line launcher that just calls the
  `.ps1` file. Exists because pointing a scheduled task straight at a
  `.ps1` path containing spaces needs nested quoting that's easy to get
  wrong; pointing it at this `.bat` instead sidesteps that.
- `keepalive-logs/` — not committed (see `.gitignore`). Grows over time;
  safe to delete or trim the log file at any point.

## The registered task

Registered via the `ScheduledTasks` PowerShell module, **not** the legacy
`schtasks /create /tr "<path>"` CLI form:

```powershell
$action    = New-ScheduledTaskAction -Execute "<path>\run-keepalive-check.bat"
$trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Thursday -At 19:00
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$env:USERNAME" -LogonType Interactive
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "QuotaSuccess Keep-Alive Check" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "..."
```

This matters: the task was first registered with `schtasks /create /tr
"<path with spaces>\run-keepalive-check.bat"`, which reported `SUCCESS` but
silently corrupted the stored task — `schtasks.exe`'s own `/TR` parser
splits any path containing a space at the first space, regardless of
quoting (plain quotes, embedded literal quotes, and PowerShell's `--%`
stop-parsing token were all tried; all four produced the identical split).
The result was a task that tried to run a nonexistent file called `Claude`
with everything after the first space as arguments, failing with
`ERROR_FILE_NOT_FOUND` on every fire for a full week (7 Sept – 14 Sept)
without ever showing up as an error anywhere obvious. The `ScheduledTasks`
module doesn't have this bug — confirmed by exporting the task XML
(`schtasks /query /tn "..." /xml`) and checking the `<Command>` element
holds the full, unsplit path with no `<Arguments>` element at all. If this
task is ever deleted and recreated, use the PowerShell module form above,
not `schtasks /create /tr`.

`-StartWhenAvailable` is also a genuine improvement over the original
registration: a missed fire (machine off or asleep at the scheduled time)
now catches up automatically instead of being silently skipped.

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
