; Releases up to 0.7.30 installed as "Bull" in $LOCALAPPDATA\Bull. productName names the install
; folder, so NEXRON-Bull lands beside it instead of replacing it, and both copies would keep
; overwriting the shared agentd in ~/.nexron-chat with their own. The old copy is uninstalled
; silently: without the dialog its "delete app data" box stays off, so settings and the WebView
; storage (named after the unchanged bundle id) survive. `_?=` keeps the uninstaller in place so
; ExecWait waits for it; it cannot delete itself then, so its file and folder go afterwards.
!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$LOCALAPPDATA\Bull\uninstall.exe" 0 +4
    ExecWait '"$LOCALAPPDATA\Bull\uninstall.exe" /S _?=$LOCALAPPDATA\Bull'
    Delete "$LOCALAPPDATA\Bull\uninstall.exe"
    RMDir "$LOCALAPPDATA\Bull"
!macroend
