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
    Add-Content -Path $LogFile -Value $Message
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
Write-Log ""
Write-Log "===== $stamp ====="

try {
    if (-not (Test-Path $PromptFile)) {
        Write-Log "FATAL: prompt file not found at $PromptFile"
        exit 1
    }
    $prompt = Get-Content -Path $PromptFile -Raw

    $claude = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $claude) {
        Write-Log "FATAL: 'claude' CLI not found on PATH for this task's execution context."
        exit 1
    }

    # --permission-mode bypassPermissions: required for a non-interactive,
    # unattended run -- there is no terminal here to approve a tool-use
    # prompt, so without this the process would just hang until Task
    # Scheduler's own timeout killed it, which would look identical to a
    # real failure in this log.
    $output = & claude -p $prompt `
        --model claude-sonnet-5 `
        --permission-mode bypassPermissions `
        --output-format text `
        --no-session-persistence 2>&1

    $exitCode = $LASTEXITCODE
    Write-Log "exit code: $exitCode"
    Write-Log $output
}
catch {
    Write-Log "FATAL: PowerShell wrapper threw an exception:"
    Write-Log $_.Exception.Message
    exit 1
}
