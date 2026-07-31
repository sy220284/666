param(
  [Parameter(Mandatory = $true)]
  [int]$ElectronProcessId,

  [Parameter(Mandatory = $true)]
  [long]$ElectronWindowHandle,

  [Parameter(Mandatory = $true)]
  [ValidateSet('candidate', 'enter', 'ascii', 'toggle-shift', 'undo', 'redo')]
  [string]$Action,

  [string]$Text = '',
  [string]$ScreenshotPath = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class WorldForgeNativeIme {
    private const uint CLSCTX_INPROC_SERVER = 0x1;
    private const uint TF_PROFILETYPE_INPUTPROCESSOR = 0x1;
    private const uint TF_IPPMF_ENABLEPROFILE = 0x1;
    private const uint TF_IPPMF_DONTCARECURRENTINPUTLANGUAGE = 0x4;
    private const uint TF_IPPMF_FORSESSION = 0x20000000;

    private static readonly Guid ClsidInputProcessorProfiles = new Guid("33C53A50-F456-4884-B049-85FD643ECFED");
    private static readonly Guid IidInputProcessorProfileMgr = new Guid("71C6E74C-0F28-11D8-A82A-00065B84435C");
    private static readonly Guid ClsidMicrosoftPinyin = new Guid("81D4E9C9-1D3B-41BC-9E6C-4B40BF79E35E");
    private static readonly Guid ProfileMicrosoftPinyin = new Guid("FA550B04-5AD7-411F-A5AC-CA038EC515D7");

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int ActivateProfileDelegate(
        IntPtr self,
        uint profileType,
        ushort languageId,
        ref Guid textServiceClsid,
        ref Guid profileGuid,
        IntPtr keyboardLayout,
        uint flags
    );

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(
        ref Guid classId,
        IntPtr outerUnknown,
        uint classContext,
        ref Guid interfaceId,
        out IntPtr interfacePointer
    );

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr LoadKeyboardLayout(string pwszKLID, uint Flags);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern IntPtr GetKeyboardLayout(uint idThread);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public static int ActivateMicrosoftPinyin() {
        IntPtr profileManager;
        Guid classId = ClsidInputProcessorProfiles;
        Guid interfaceId = IidInputProcessorProfileMgr;
        int createResult = CoCreateInstance(
            ref classId,
            IntPtr.Zero,
            CLSCTX_INPROC_SERVER,
            ref interfaceId,
            out profileManager
        );
        if (createResult < 0) {
            Marshal.ThrowExceptionForHR(createResult);
        }

        try {
            IntPtr virtualTable = Marshal.ReadIntPtr(profileManager);
            IntPtr activatePointer = Marshal.ReadIntPtr(virtualTable, IntPtr.Size * 3);
            ActivateProfileDelegate activate =
                Marshal.GetDelegateForFunctionPointer<ActivateProfileDelegate>(activatePointer);
            Guid textServiceClsid = ClsidMicrosoftPinyin;
            Guid profileGuid = ProfileMicrosoftPinyin;
            uint flags =
                TF_IPPMF_FORSESSION |
                TF_IPPMF_ENABLEPROFILE |
                TF_IPPMF_DONTCARECURRENTINPUTLANGUAGE;
            return activate(
                profileManager,
                TF_PROFILETYPE_INPUTPROCESSOR,
                0x0804,
                ref textServiceClsid,
                ref profileGuid,
                IntPtr.Zero,
                flags
            );
        }
        finally {
            Marshal.Release(profileManager);
        }
    }
}
'@

function Send-VirtualKey {
  param([byte]$VirtualKey)
  [WorldForgeNativeIme]::keybd_event($VirtualKey, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WorldForgeNativeIme]::keybd_event($VirtualKey, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
}

function Send-ControlChord {
  param([byte]$VirtualKey)
  [WorldForgeNativeIme]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WorldForgeNativeIme]::keybd_event($VirtualKey, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WorldForgeNativeIme]::keybd_event($VirtualKey, 0, 2, [UIntPtr]::Zero)
  [WorldForgeNativeIme]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
}

function Capture-Desktop {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw 'M8_07_WINDOWS_IME_SCREENSHOT_PATH_MISSING'
  }
  $directory = Split-Path -Parent $Path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$activationHresult = [WorldForgeNativeIme]::ActivateMicrosoftPinyin()
if ($activationHresult -ne 0) {
  throw ('M8_07_WINDOWS_IME_TSF_ACTIVATION_FAILED: 0x{0:X8}' -f ([uint32]$activationHresult))
}

$windowHandle = [IntPtr]$ElectronWindowHandle
if (-not [WorldForgeNativeIme]::IsWindow($windowHandle)) {
  throw ('M8_07_WINDOWS_IME_INVALID_WINDOW_HANDLE: {0}' -f $ElectronWindowHandle)
}
[WorldForgeNativeIme]::ShowWindow($windowHandle, 9) | Out-Null
[WorldForgeNativeIme]::SetForegroundWindow($windowHandle) | Out-Null
Start-Sleep -Milliseconds 350

$chineseLayout = [WorldForgeNativeIme]::LoadKeyboardLayout('00000804', 1)
if ($chineseLayout -eq [IntPtr]::Zero) {
  throw 'M8_07_WINDOWS_IME_LAYOUT_LOAD_FAILED'
}
[WorldForgeNativeIme]::PostMessage($windowHandle, 0x0050, [IntPtr]::Zero, $chineseLayout) | Out-Null
Start-Sleep -Milliseconds 500

switch ($Action) {
  'candidate' {
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 1200
    Capture-Desktop -Path $ScreenshotPath
    Send-VirtualKey -VirtualKey 0x20
  }
  'enter' {
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 700
    Send-VirtualKey -VirtualKey 0x20
    Send-VirtualKey -VirtualKey 0x0D
  }
  'ascii' {
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 200
  }
  'toggle-shift' {
    Send-VirtualKey -VirtualKey 0x10
  }
  'undo' {
    Send-ControlChord -VirtualKey 0x5A
  }
  'redo' {
    Send-ControlChord -VirtualKey 0x59
  }
}

Start-Sleep -Milliseconds 300
[uint32]$windowProcessId = 0
$windowThreadId = [WorldForgeNativeIme]::GetWindowThreadProcessId($windowHandle, [ref]$windowProcessId)
$activeLayout = [WorldForgeNativeIme]::GetKeyboardLayout($windowThreadId)
$languageId = ([int64]$activeLayout) -band 0xffff

[pscustomobject]@{
  action = $Action
  text = $Text
  electronProcessId = $ElectronProcessId
  electronWindowHandle = $ElectronWindowHandle
  windowProcessId = $windowProcessId
  windowThreadId = $windowThreadId
  activationHresult = ('0x{0:X8}' -f ([uint32]$activationHresult))
  textServiceClsid = '81D4E9C9-1D3B-41BC-9E6C-4B40BF79E35E'
  profileGuid = 'FA550B04-5AD7-411F-A5AC-CA038EC515D7'
  languageId = ('0x{0:X4}' -f $languageId)
  screenshotPath = $ScreenshotPath
  timestamp = (Get-Date).ToString('o')
} | ConvertTo-Json -Compress
