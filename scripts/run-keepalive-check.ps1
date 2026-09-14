# QuotaSuccess keep-alive check runner.
#
# Invoked by a Windows Scheduled Task (see scripts/README.md for how it was
# registered). Runs `claude -p` non-interactively against the prompt in
# keepalive-check-prompt.txt and appends the result to a local log file.
#
# This exists specifically because a cloud-hosted scheduled Routine doing the
# same job failed silently for weeks: the cloud sandbox's network egress
# policy blocked outbound access to quotasuccess.com.au entirely, so it never
# actually reached the site, and nothing surfaced that failure until Supabase
# itself emailed a pause notice. Running from this machine's own network
# avoids that specific failure mode. This script still can't guarantee
# claude.exe itself will succeed, which is exactly why every code path below
# writes to the log, including the ones where claude.exe never even starts.

$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$PromptFile = Join-Path $ScriptDir "keepalive-check-prompt.txt"
$LogDir     = Join-Path $ScriptDir "keepalive-logs"
$LogFile    = Join-Path $LogDir "keepalive-check.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    # -Encoding UTF8: without it, Add-Content falls back to the system ANSI
    # codepage in Windows PowerShell 5.1, which corrupts non-ASCII characters
    # (em dashes, curly quotes) that claude.exe's own UTF-8 output contains.
    Add-Content -Path $LogFile -Value $Message -Encoding UTF8
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
Write-Log ""
Write-Log "===== $stamp ====="

try {
    if (-not (Test-Path $PromptFile)) {
        Write-Log "FATAL: prompt file not found at $PromptFile"
        exit 1
    }

    $claude = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $claude) {
        Write-Log "FATAL: 'claude' CLI not found on PATH for this task's execution context."
        exit 1
    }

    # The prompt is piped via stdin rather than passed as a CLI argument.
    # A first run (2026-09-14) proved passing it as an argv element gets
    # mangled by Windows/PowerShell native command-line parsing: the JSON
    # body (full of embedded double quotes) came through truncated and with
    # corrupted characters. Stdin sidesteps that parsing entirely.
    # --permission-mode bypassPermissions: required for a non-interactive,
    # unattended run -- there is no terminal here to approve a tool-use
    # prompt, so without this the process would just hang until Task
    # Scheduler's own timeout killed it, which would look identical to a
    # real failure in this log.
    $prevOutputEncoding = $OutputEncoding
    $OutputEncoding = [System.Text.Encoding]::UTF8
    try {
        $output = Get-Content -Path $PromptFile -Raw -Encoding UTF8 | & claude -p `
            --model claude-sonnet-5 `
            --permission-mode bypassPermissions `
            --output-format text `
            --no-session-persistence 2>&1
    }
    finally {
        $OutputEncoding = $prevOutputEncoding
    }

    $exitCode = $LASTEXITCODE
    Write-Log "exit code: $exitCode"
    Write-Log $output
}
catch {
    Write-Log "FATAL: PowerShell wrapper threw an exception:"
    Write-Log $_.Exception.Message
    exit 1
}
