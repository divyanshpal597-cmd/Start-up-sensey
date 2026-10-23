; Windows installer for Laptop Remote (Inno Setup 6). Built by packaging/build.py.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6E0B8F55-3C1E-4C47-9C0B-7A3B1B3E9A21}
AppName=Laptop Remote
AppVersion={#AppVersion}
AppPublisher=Laptop Remote
DefaultDirName={autopf}\Laptop Remote
DefaultGroupName=Laptop Remote
DisableProgramGroupPage=yes
OutputBaseFilename=LaptopRemote-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\LaptopRemote.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Admin rights are needed once, to let phones on your home Wi-Fi reach the app through the firewall.
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Laptop Remote"; Filename: "{app}\LaptopRemote.exe"
Name: "{autodesktop}\Laptop Remote"; Filename: "{app}\LaptopRemote.exe"

[Registry]
; Laptop Remote only runs when you open it. If you turned on "Start when I log in"
; in its tray menu, uninstalling removes that again.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "LaptopRemote"; Flags: uninsdeletevalue dontcreatekey

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Laptop Remote"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Laptop Remote"" dir=in action=allow program=""{app}\LaptopRemote.exe"" enable=yes profile=private,domain"; Flags: runhidden
Filename: "{app}\LaptopRemote.exe"; Description: "Start Laptop Remote and connect my phone"; Flags: nowait postinstall runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im LaptopRemote.exe"; Flags: runhidden; RunOnceId: "StopApp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Laptop Remote"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"
