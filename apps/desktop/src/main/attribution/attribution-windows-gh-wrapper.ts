import { YIRU_GH_FOOTER } from './attribution-values'

const POWERSHELL_TICK = '`'

export const WIN32_GH_PS_WRAPPER = String.raw`$ErrorActionPreference = 'Stop'
$realGh = if ($env:YIRU_REAL_GH) { $env:YIRU_REAL_GH } else { 'gh' }

function Test-NonInteractiveCreateArgs {
  param([string[]]$CommandArgs)
  foreach ($arg in $CommandArgs) {
    if ($arg -match '^(--title|-t|--body|-b|--body-file|-F|--fill|--fill-first|--fill-verbose|--template|-T|--recover|--web)(=|$)') {
      return $true
    }
  }
  return $false
}

function Test-PassthroughCreateArgs {
  param([string[]]$CommandArgs)
  foreach ($arg in $CommandArgs) {
    if ($arg -eq '--help' -or $arg -eq '-h' -or $arg -eq '--version') {
      return $true
    }
  }
  return $false
}

function Get-GitHubApiPath {
  param([string]$Kind, [string]$CreatedUrl)
  if ($Kind -eq 'pr' -and $CreatedUrl -match '^https://github\.com/([^/]+)/([^/]+)/pull/([0-9]+)') {
    return "repos/$($Matches[1])/$($Matches[2])/pulls/$($Matches[3])"
  }
  return $null
}

function Test-CreateCommand {
  param([string[]]$CommandArgs, [string]$Kind)
  return $CommandArgs.Count -ge 2 -and $CommandArgs[0].ToLowerInvariant() -eq $Kind -and $CommandArgs[1].ToLowerInvariant() -eq 'create'
}

$isPrCreate = Test-CreateCommand $args 'pr'
if ($isPrCreate -and (Test-PassthroughCreateArgs $args)) {
  & $realGh @args
  exit $LASTEXITCODE
}

if ($isPrCreate -and -not (Test-NonInteractiveCreateArgs $args)) {
  & $realGh @args
  $status = $LASTEXITCODE
  if ($status -ne 0) {
    exit $status
  }
  exit 0
}

$stdoutFile = [System.IO.Path]::GetTempFileName()
$stderrFile = [System.IO.Path]::GetTempFileName()
& $realGh @args > $stdoutFile 2> $stderrFile
$status = $LASTEXITCODE
$stdoutCapture = if (Test-Path -LiteralPath $stdoutFile) { Get-Content -LiteralPath $stdoutFile -Raw } else { '' }
$stderrCapture = if (Test-Path -LiteralPath $stderrFile) { Get-Content -LiteralPath $stderrFile -Raw } else { '' }
if ($stderrCapture) {
  [Console]::Error.Write($stderrCapture)
}
if ($status -ne 0) {
  if ($stdoutCapture) {
    [Console]::Out.Write($stdoutCapture)
  }
  Remove-Item -LiteralPath $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
  exit $status
}
if ($stdoutCapture) {
  [Console]::Out.Write($stdoutCapture)
}

if ($isPrCreate) {
  $createdUrl = ([regex]::Matches(($stdoutCapture + [Environment]::NewLine + $stderrCapture), 'https://github.com/\S+/pull/\d+') | Select-Object -Last 1).Value
  if ($createdUrl) {
    $apiPath = Get-GitHubApiPath 'pr' $createdUrl
    $body = if ($apiPath) { (& $realGh api $apiPath --jq '.body // ""' 2>$null) | Out-String } else { $null }
    if ($LASTEXITCODE -ne 0) {
      $body = $null
    }
    $footer = if ($env:YIRU_GH_PR_FOOTER) { $env:YIRU_GH_PR_FOOTER } else { '${YIRU_GH_FOOTER}' }
    if ($null -ne $body -and $body -notmatch [Regex]::Escape($footer)) {
      $tmpFile = [System.IO.Path]::GetTempFileName()
      try {
        $trimmed = $body.TrimEnd("${POWERSHELL_TICK}r", "${POWERSHELL_TICK}n")
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
          Set-Content -LiteralPath $tmpFile -Value $footer -NoNewline
        } else {
          Set-Content -LiteralPath $tmpFile -Value ($trimmed + "${POWERSHELL_TICK}r${POWERSHELL_TICK}n${POWERSHELL_TICK}r${POWERSHELL_TICK}n" + $footer) -NoNewline
        }
        # Why: gh has no transactional body append for newly-created PRs. This
        # immediate REST patch keeps attribution scoped to the URL gh returned.
        try {
          & $realGh api -X PATCH $apiPath -F "body=@$tmpFile" | Out-Null
        } catch {
        }
      } finally {
        Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Remove-Item -LiteralPath $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
exit 0
`
