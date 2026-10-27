using System;
using System.IO;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Security.Cryptography;

// Raw binary transport only; never returns child stderr or plaintext.
public static class SolqEncryptedStream {
    static async Task Drain(Stream stream) {
        byte[] buffer = new byte[8192];
        try { while (await stream.ReadAsync(buffer, 0, buffer.Length) != 0) {} }
        finally { Array.Clear(buffer, 0, buffer.Length); }
    }
    public static ProcessStartInfo StartInfo(string exe, string args) {
        return new ProcessStartInfo(exe, args) { UseShellExecute=false,
          CreateNoWindow=true, RedirectStandardInput=true,
          RedirectStandardOutput=true, RedirectStandardError=true };
    }
    public static string PublicMetadata(string exe, string args) {
        using (var p = new Process { StartInfo = StartInfo(exe,args) }) {
            try {
                p.Start(); p.StandardInput.Close();
                var stdout=p.StandardOutput.ReadToEndAsync();
                var stderr=Drain(p.StandardError.BaseStream);
                if (!Task.WhenAll(stdout,stderr).Wait(60000) || !p.WaitForExit(5000) || p.ExitCode!=0)
                    throw new IOException("PUBLIC_METADATA_FAILED");
                return stdout.Result;
            } finally { Stop(p); }
        }
    }
    static void Stop(Process p) { try { if (p != null && !p.HasExited) { p.Kill(); p.WaitForExit(5000); } } catch {} }
    public static string Run(ProcessStartInfo source, ProcessStartInfo cipher, string target, int timeoutMs) {
        string partial = target + ".partial.gpg";
        if (File.Exists(target) || File.Exists(partial)) throw new IOException("DESTINATION_EXISTS");
        Process a=null, b=null;
        try {
            using (FileStream output = new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
                a=new Process { StartInfo=source }; b=new Process { StartInfo=cipher };
                b.Start(); var be=Drain(b.StandardError.BaseStream);
                var encrypted=b.StandardOutput.BaseStream.CopyToAsync(output);
                a.Start(); a.StandardInput.Close(); var ae=Drain(a.StandardError.BaseStream);
                // Remove password from managed startup configuration immediately after child creation.
                a.StartInfo.EnvironmentVariables.Remove("PGPASSWORD");
                var transfer=a.StandardOutput.BaseStream.CopyToAsync(b.StandardInput.BaseStream);
                var closeInput=transfer.ContinueWith(t => {
                    try { b.StandardInput.Close(); } catch {}
                    if(t.IsFaulted) throw new IOException("TRANSFER_FAILED");
                });
                var all=Task.WhenAll(closeInput,encrypted,ae,be);
                if (!all.Wait(timeoutMs)) throw new IOException("STREAM_TIMEOUT");
                if (!a.WaitForExit(5000) || !b.WaitForExit(5000)) throw new IOException("EXIT_TIMEOUT");
                if (a.ExitCode!=0 || b.ExitCode!=0) throw new IOException("CHILD_FAILED");
                output.Flush(true);
                if (output.Length==0) throw new IOException("EMPTY_CIPHERTEXT");
            }
            // Only encrypted bytes are hashed. Never overwrite a prior successful output.
            string digest;
            using(var s=File.OpenRead(partial)) using(var sha=SHA256.Create())
                digest=BitConverter.ToString(sha.ComputeHash(s)).Replace("-","").ToLowerInvariant();
            File.Move(partial,target);
            return digest;
        } catch {
            Stop(a); Stop(b);
            // Ciphertext may be incomplete; never expose child exception/message text.
            throw new IOException("ENCRYPTED_EXPORT_INCOMPLETE");
        } finally {
            source.EnvironmentVariables.Remove("PGPASSWORD");
            Stop(a); Stop(b);
            if(a!=null) a.Dispose(); if(b!=null) b.Dispose();
        }
    }
}
