#NoEnv
#Warn
SendMode Input
SetWorkingDir %A_ScriptDir%

; Simple helper that pastes commands into the focused GZDoom window.
; Hotkeys: Ctrl+Alt+1/2/3 for Flat/Long/Short, Ctrl+Alt+[ / ] for sigma, Ctrl+Alt+; / ' for loss.

global sigma := 0.50
global loss := 0.40

target := "GZDoom"

SendConsole(cmd) {
    ; Assumes the GZDoom console is already open or bound to `~`.
    SendInput, %cmd%
    SendInput, {Enter}
}

EnsureConsole() {
    ; Toggle console open/close quickly to ensure focus.
    SendInput, `~
    Sleep, 40
}

Clamp(val) {
    if (val < 0)
        return 0
    if (val > 1)
        return 1
    return val
}

EmitSigma() {
    global sigma
    sigma := Clamp(sigma)
    SendConsole("pukename MR_SetSigma " . Format("{1:0.2f}", sigma))
}

EmitLoss() {
    global loss
    loss := Clamp(loss)
    SendConsole("pukename MR_SetLoss " . Format("{1:0.2f}", loss))
}

^!1::
EnsureConsole()
SendConsole("pukename MR_SetAlign 0")
return

^!2::
EnsureConsole()
SendConsole("pukename MR_SetAlign 1")
return

^!3::
EnsureConsole()
SendConsole("pukename MR_SetAlign 2")
return

^![::
sigma -= 0.05
EnsureConsole()
EmitSigma()
return

^!]::
sigma += 0.05
EnsureConsole()
EmitSigma()
return

^!;::
loss -= 0.05
EnsureConsole()
EmitLoss()
return

^!'::
loss += 0.05
EnsureConsole()
EmitLoss()
return

^!a::
EnsureConsole()
SendConsole("pukename MR_ToggleAuto")
return
