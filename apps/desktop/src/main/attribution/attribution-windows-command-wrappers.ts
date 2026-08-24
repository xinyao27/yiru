export const WIN32_GIT_CMD_WRAPPER = String.raw`@echo off
setlocal
if not "%YIRU_ENABLE_GIT_ATTRIBUTION%"=="1" goto run
if "%YIRU_ATTRIBUTION_BYPASS%"=="1" goto run
call :yiru_is_git_commit %*
if errorlevel 1 goto run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-wrapper.ps1" %*
exit /b %ERRORLEVEL%
:run
if defined YIRU_REAL_GIT (
  "%YIRU_REAL_GIT%" %*
) else (
  echo Yiru attribution wrapper could not locate git on PATH. 1>&2
  exit /b 127
)
exit /b %ERRORLEVEL%

:yiru_is_git_commit
if "%~1"=="" exit /b 1
if /I "%~1"=="commit" exit /b 0
set "yiru_git_arg=%~1"
if /I "%yiru_git_arg%"=="-c" goto skip_two
if /I "%yiru_git_arg%"=="--config" goto skip_two
if /I "%yiru_git_arg%"=="-C" goto skip_two
if /I "%yiru_git_arg%"=="--git-dir" goto skip_two
if /I "%yiru_git_arg%"=="--work-tree" goto skip_two
if /I "%yiru_git_arg%"=="--namespace" goto skip_two
if /I "%yiru_git_arg:~0,9%"=="--config=" goto skip_one
if /I "%yiru_git_arg:~0,10%"=="--git-dir=" goto skip_one
if /I "%yiru_git_arg:~0,12%"=="--work-tree=" goto skip_one
if /I "%yiru_git_arg:~0,12%"=="--namespace=" goto skip_one
if "%yiru_git_arg:~0,1%"=="-" goto skip_one
exit /b 1
:skip_two
shift
shift
goto yiru_is_git_commit
:skip_one
shift
goto yiru_is_git_commit
`

export const WIN32_GH_CMD_WRAPPER = String.raw`@echo off
setlocal
if not "%YIRU_ENABLE_GIT_ATTRIBUTION%"=="1" goto run
if "%YIRU_ATTRIBUTION_BYPASS%"=="1" goto run
if /I "%~1"=="pr" if /I "%~2"=="create" goto wrap
goto run
:wrap
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0gh-wrapper.ps1" %*
exit /b %ERRORLEVEL%
:run
if defined YIRU_REAL_GH (
  "%YIRU_REAL_GH%" %*
) else (
  echo Yiru attribution wrapper could not locate gh on PATH. 1>&2
  exit /b 127
)
exit /b %ERRORLEVEL%
`
