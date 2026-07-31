param(
  [Parameter(Mandatory = $true)]
  [int]$ElectronProcessId,

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
}
'@

function Get-ElectronWindowHandle {
  param([int]$RootProcessId)

  $root = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
  if ($root -and $root.MainWindowHandle -ne 0) {
    return [IntPtr]$root.MainWindowHandle
  }

  $candidate = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime |
    Select-Object -First 1
  if (-not $candidate) {
    throw 'M8_07_WINDOWS_IME_WINDOW_NOT_FOUND'
  }
  return [IntPtr]$candidate.MainWindowHandle
}

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

$windowHandle = Get-ElectronWindowHandle -RootProcessId $ElectronProcessId
[WorldForgeNativeIme]::ShowWindow($windowHandle, 9) | Out-Null
[WorldForgeNativeIme]::SetForegroundWindow($windowHandle) | Out-Null
Start-Sleep -Milliseconds 350

$chineseLayout = [WorldForgeNativeIme]::LoadKeyboardLayout('00000804', 1)
if ($chineseLayout -eq [IntPtr]::Zero) {
  throw 'M8_07_WINDOWS_IME_LAYOUT_LOAD_FAILED'
}
[WorldForgeNativeIme]::PostMessage($windowHandle, 0x0050, [IntPtr]::Zero, $chineseLayout) | Out-Null
Start-Sleep -Milliseconds 350

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
  windowProcessId = $windowProcessId
  windowThreadId = $windowThreadId
  languageId = ('0x{0:X4}' -f $languageId)
  screenshotPath = $ScreenshotPath
  timestamp = (Get-Date).ToString('o')
} | ConvertTo-Json -Compress
