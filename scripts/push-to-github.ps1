param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Pause-BeforeExit {
  Write-Host ""
  Read-Host "Press Enter to close"
}

try {
  $branch = (git branch --show-current).Trim()
  if (-not $branch) {
    throw "Could not detect the current Git branch."
  }

  Write-Host "Repository: $repo"
  Write-Host "Branch: $branch"
  Write-Host ""

  git status --short
  $changes = (git status --porcelain)
  if (-not $changes) {
    Write-Host "No changes to push."
    Pause-BeforeExit
    exit 0
  }

  if (-not $Message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Update LMS $stamp"
  }

  Write-Host ""
  Write-Host "Adding changes..."
  git add -A

  Write-Host "Committing: $Message"
  git commit -m $Message

  Write-Host "Pushing to origin/$branch..."
  git push origin $branch

  Write-Host ""
  Write-Host "Done. Changes are on GitHub."
} catch {
  Write-Host ""
  Write-Host "Push failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Pause-BeforeExit
