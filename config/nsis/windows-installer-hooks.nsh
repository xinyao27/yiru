; Windows install/uninstall hooks for Spool networking and daemon cleanup.
; Keep 52777 in sync with SPOOL_INGRESS_PORT in spool-wire-contract.ts.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Orca.Spool"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Orca.Spool" description="Allows Orca Spool sharing over Tailscale." dir=in action=allow enable=yes profile=private protocol=TCP localport=52777 program="$INSTDIR\Orca.exe" edge=no'
!macroend

!macro customUnInstall
  ; Why: the relocated daemon deliberately survives updates; only a real uninstall may remove it.
  ; Keep the image and folder names in sync with daemon-host-relocation.ts.
  ${ifNot} ${isUpdated}
    nsExec::Exec 'netsh advfirewall firewall delete rule name="Orca.Spool"'
    nsExec::Exec 'taskkill /F /IM orca-terminal-daemon.exe'
    ; Give the OS a moment to release the image lock before removing the tree.
    Sleep 500
    RMDir /r "$LOCALAPPDATA\Orca\daemon-host"
  ${endIf}
!macroend
