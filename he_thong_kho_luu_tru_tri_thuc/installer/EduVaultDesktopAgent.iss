[Setup]
AppId={{3B4A6848-8513-4564-9A6D-C530BDA49591}
AppName=EduVault Desktop Agent
AppVersion=1.0.0
DefaultDirName={autopf}\EduVault Desktop Agent
DefaultGroupName=EduVault Desktop Agent
OutputDir=..\desktop-agent\dist
OutputBaseFilename=EduVaultDesktopAgentSetup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern

[Files]
Source: "..\desktop-agent\dist\EduVaultDesktopAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\desktop-agent\config.example.json"; DestDir: "{app}"; DestName: "config.json"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\EduVault Desktop Agent"; Filename: "{app}\EduVaultDesktopAgent.exe"
Name: "{autodesktop}\EduVault Desktop Agent"; Filename: "{app}\EduVaultDesktopAgent.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Tạo shortcut ngoài Desktop"; GroupDescription: "Shortcut:"

[Run]
Filename: "{app}\EduVaultDesktopAgent.exe"; Description: "Khởi động EduVault Desktop Agent"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "EduVaultDesktopAgent"; ValueData: """{app}\EduVaultDesktopAgent.exe"" --startup"; Flags: uninsdeletevalue
