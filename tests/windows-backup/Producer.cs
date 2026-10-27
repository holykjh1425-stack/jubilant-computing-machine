using System;
using System.Threading;
public static class SyntheticProducer {
    public static int Main(string[] args) {
        string mode=args.Length==0 ? "ok" : args[0];
        if(mode=="timeout") { Thread.Sleep(30000); return 0; }
        byte[] bytes=new byte[1048593];
        for(int i=0;i<bytes.Length;i++) bytes[i]=(byte)(i%256);
        var stream=Console.OpenStandardOutput();
        stream.Write(bytes,0,bytes.Length); stream.Flush();
        Array.Clear(bytes,0,bytes.Length);
        return mode=="fail" ? 17 : 0;
    }
}
