param([Parameter(Mandatory = $true)][string]$RuntimeDirectory)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# Query LABEL_SECURITY_INFORMATION explicitly: Get-Acl can omit mandatory labels.
# Read-only Win32 calls; no permission or integrity changes are made here.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class OpiaGpuIntegrity {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetNamedSecurityInfoW")]
    static extern uint GetNamedSecurityInfo(string name, int type, uint info,
        out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true,
        EntryPoint = "ConvertSecurityDescriptorToStringSecurityDescriptorW")]
    static extern bool ConvertDescriptor(IntPtr descriptor, uint revision, uint info,
        out IntPtr text, out uint length);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    public static string ReadLabel(string path) {
        IntPtr owner, group, dacl, sacl, descriptor, text = IntPtr.Zero;
        uint error = GetNamedSecurityInfo(path, 1, 0x10, out owner, out group,
            out dacl, out sacl, out descriptor);
        if (error != 0) throw new Win32Exception((int)error);
        try {
            uint length;
            if (!ConvertDescriptor(descriptor, 1, 0x10, out text, out length))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return Marshal.PtrToStringUni(text);
        } finally {
            if (text != IntPtr.Zero) LocalFree(text);
            if (descriptor != IntPtr.Zero) LocalFree(descriptor);
        }
    }
}
'@

$records = foreach ($name in @('electron.exe', 'libEGL.dll', 'libGLESv2.dll', 'd3dcompiler_47.dll')) {
    $target = Join-Path $RuntimeDirectory $name
    $record = @{ path = $target; exists = (Test-Path -LiteralPath $target -PathType Leaf) }
    if ($record.exists) {
        try { $record.sddl = [OpiaGpuIntegrity]::ReadLabel($target) }
        catch { $record.error = $_.Exception.Message }
    }
    $record
}
ConvertTo-Json -InputObject @($records) -Depth 3 -Compress
