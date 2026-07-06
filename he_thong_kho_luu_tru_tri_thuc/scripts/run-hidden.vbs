Option Explicit

Dim shell, command, index, arg
Set shell = CreateObject("WScript.Shell")

command = ""
For index = 0 To WScript.Arguments.Count - 1
    arg = Replace(WScript.Arguments(index), """", """""")
    If Len(command) > 0 Then command = command & " "
    command = command & """" & arg & """"
Next

If Len(command) > 0 Then
    shell.Run command, 0, False
End If
