; Clean up the relocated terminal daemon on a REAL uninstall.
;
; Why: the daemon host is deliberately copied to a distinct image name
; (orca-terminal-daemon.exe) under %LOCALAPPDATA%\Orca\daemon-host so that app
; UPDATES cannot kill it — that relocation is what keeps terminals alive across
; updates. The same design means a normal uninstall's process sweep and file
; removal both miss it, leaving an orphaned daemon plus its runtime copy behind.
;
; The ${isUpdated} guard is essential: electron-builder runs this uninstaller as
; part of uninstallOldVersion on EVERY update, and killing the daemon there would
; defeat the whole feature. Only clean up on a genuine uninstall.
;
; The image name and the LOCALAPPDATA folder name must stay in sync with
; DAEMON_HOST_EXE_NAME and LOCAL_HOST_ROOT_NAME in
; src/main/daemon/daemon-host-relocation.ts.
; Seed the packaged executable's fixed-port rule during install. Runtime
; validation offers an elevated repair when this installer context cannot write it.
; Keep 52777 in sync with SPOOL_INGRESS_PORT in spool-wire-contract.ts.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Orca.Spool"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Orca.Spool" description="Allows Orca Spool sharing over Tailscale." dir=in action=allow enable=yes profile=private protocol=TCP localport=52777 program="$INSTDIR\Orca.exe" edge=no'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec 'netsh advfirewall firewall delete rule name="Orca.Spool"'
    nsExec::Exec 'taskkill /F /IM orca-terminal-daemon.exe'
    ; Give the OS a moment to release the image lock before removing the tree.
    Sleep 500
    RMDir /r "$LOCALAPPDATA\Orca\daemon-host"
  ${endIf}
!macroend
