// Windows process-loopback capture. No files, microphone, client injection or credentials.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

class Bridge {
 static volatile bool running = true;
 static string token;
 static Label status;
 static TcpListener listener;
 [STAThread] static void Main(string[] args) {
  if (args.Contains("--probe")) { var t=new Thread(Probe);t.SetApartmentState(ApartmentState.MTA);t.Start();t.Join();return; }
  Application.EnableVisualStyles();
  byte[] secret = new byte[24]; using(var rng=RandomNumberGenerator.Create()) rng.GetBytes(secret);
  token=BitConverter.ToString(secret).Replace("-", "").ToLowerInvariant();
  if(args.Contains("--headless")){Console.WriteLine(token);var worker=new Thread(Serve);worker.SetApartmentState(ApartmentState.MTA);worker.Start();worker.Join();return;}
  var form=new Form {Text="11scat 音乐连接", Width=490, Height=235, FormBorderStyle=FormBorderStyle.FixedDialog, MaximizeBox=false};
  var info=new Label {Left=20,Top=18,Width=440,Height=42,Text="只连接网易云音乐，不采集麦克风或其他应用。\n在网站音乐窗口粘贴配对码；关闭此程序即可停止。"};
  var box=new TextBox {Left=20,Top=70,Width=435,ReadOnly=true,Text=token};
  var copy=new Button {Left=20,Top=105,Width=130,Text="复制配对码"}; copy.Click+=(s,e)=>Clipboard.SetText(token);
  status=new Label {Left=20,Top=147,Width=440,Height=38,Text="等待网站连接；尚未采集音乐"};
  form.Controls.AddRange(new Control[]{info,box,copy,status});
  form.FormClosed+=(s,e)=>{running=false;if(listener!=null)listener.Stop();};
  var thread=new Thread(Serve);thread.IsBackground=true;thread.SetApartmentState(ApartmentState.MTA);thread.Start();
  Application.Run(form);
 }
 static void Status(string s){if(status!=null && status.IsHandleCreated)try{status.BeginInvoke(new Action(()=>status.Text=s));}catch{}}
 static Process Player(){return Process.GetProcessesByName("cloudmusic").OrderByDescending(p=>p.MainWindowHandle!=IntPtr.Zero).FirstOrDefault();}
 static void Probe(){try{var p=Player();if(p==null)throw new Exception("网易云未运行");using(var c=new Capture(p.Id)){long frames=0;double peak=0;var until=DateTime.UtcNow.AddSeconds(3);while(DateTime.UtcNow<until){var b=c.Read();frames+=b.Length/4;for(int i=0;i+1<b.Length;i+=2)peak=Math.Max(peak,Math.Abs((double)BitConverter.ToInt16(b,i))/32768);Thread.Sleep(10);}Console.WriteLine("process="+p.Id+" frames="+frames+" peak="+peak.ToString("F4"));}}catch(Exception e){Console.WriteLine("capture_failed="+e.GetType().Name+" "+e.Message);Environment.ExitCode=1;}}
 static void Serve(){try{
  listener=new TcpListener(IPAddress.Loopback,19743);listener.Start(1);
  while(running){using(var client=listener.AcceptTcpClient())try{
   client.ReceiveTimeout=5000;client.SendTimeout=2000;client.NoDelay=true;var stream=client.GetStream();
   string header="";while(header.Length<8192&&!header.EndsWith("\r\n\r\n")){int b=stream.ReadByte();if(b<0)break;header+=(char)b;}
   var lines=header.Split(new[]{"\r\n"},StringSplitOptions.None);
   Func<string,string> field=name=>lines.Where(l=>l.StartsWith(name+":",StringComparison.OrdinalIgnoreCase)).Select(l=>l.Substring(name.Length+1).Trim()).FirstOrDefault();
   string origin=field("Origin"), key=field("Sec-WebSocket-Key");
   // Local development is deliberately restricted to one explicit test origin.
   if(lines[0]!="GET /music/"+token+" HTTP/1.1" || (origin!="https://study.11scat.xyz" && origin!="http://127.0.0.1:3112") || field("Sec-WebSocket-Version")!="13" || !string.Equals(field("Upgrade"),"websocket",StringComparison.OrdinalIgnoreCase) || key==null){var denied=Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");stream.Write(denied,0,denied.Length);continue;}
   string accept;using(var sha=SHA1.Create())accept=Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
   var response=Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+accept+"\r\n\r\n");stream.Write(response,0,response.Length);
   var player=Player();if(player==null){Frame(stream,1,Encoding.UTF8.GetBytes("{\"error\":\"请先打开桌面网易云\"}"));continue;}
   using(var capture=new Capture(player.Id)){
    Frame(stream,1,Encoding.UTF8.GetBytes("{\"ready\":true,\"sampleRate\":48000,\"channels\":2}"));
    Status("已连接网站，只采集网易云；分享由网站邀请控制");
    var heartbeat=DateTime.UtcNow;
    while(running&&!player.HasExited){
     if(client.Client.Poll(0,SelectMode.SelectRead)){ // A close or any client frame ends this one-way session.
      break;
     }
     var pcm=capture.Read();if(pcm.Length>0)Frame(stream,2,pcm);if((DateTime.UtcNow-heartbeat).TotalSeconds>2){Frame(stream,1,Encoding.UTF8.GetBytes("{\"alive\":true}"));heartbeat=DateTime.UtcNow;}Thread.Sleep(10);
    }
   }
  }catch(Exception e){Status("连接已停止："+e.Message);}finally{Status("采集已停止，等待网站重新连接");}}
 }catch(Exception e){Status("无法启动："+e.Message);}}
 static void Frame(Stream s,int opcode,byte[] data){s.WriteByte((byte)(128|opcode));if(data.Length<126)s.WriteByte((byte)data.Length);else{s.WriteByte(126);s.WriteByte((byte)(data.Length>>8));s.WriteByte((byte)data.Length);}s.Write(data,0,data.Length);}
}

[StructLayout(LayoutKind.Sequential,Pack=2)] public struct Wave {public ushort tag,channels;public uint rate,bytes;public ushort align,bits,extra;}
[StructLayout(LayoutKind.Explicit,Size=24)] struct Variant {[FieldOffset(0)]public ushort vt;[FieldOffset(8)]public int size;[FieldOffset(16)]public IntPtr data;}
[ComImport,Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IOperation {[PreserveSig]int Result(out int hr,[MarshalAs(UnmanagedType.IUnknown)]out object audio);}
[ComImport,Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IAudio {
 [PreserveSig]int Initialize(int share,int flags,long buffer,long period,ref Wave format,IntPtr session);
 [PreserveSig]int BufferSize(out uint frames);[PreserveSig]int Latency(out long latency);[PreserveSig]int Padding(out uint frames);[PreserveSig]int IsFormatSupported(int mode,IntPtr format,out IntPtr closest);[PreserveSig]int MixFormat(out IntPtr format);[PreserveSig]int Period(out long def,out long min);[PreserveSig]int Start();[PreserveSig]int Stop();[PreserveSig]int Reset();[PreserveSig]int Event(IntPtr handle);[PreserveSig]int Service(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object service);
}
[ComImport,Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface ICapture {
 [PreserveSig]int Buffer(out IntPtr data,out uint frames,out uint flags,out ulong device,out ulong qpc);[PreserveSig]int Release(uint frames);[PreserveSig]int Next(out uint frames);
}
[ComVisible(true),Guid("41D949AB-9862-444A-80F6-C261334DA5EB"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface ICompletion {[PreserveSig]int ActivateCompleted([MarshalAs(UnmanagedType.Interface)]IOperation operation);}
[ComVisible(true),Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IAgile {}
[ComVisible(true),ClassInterface(ClassInterfaceType.None)] public class Capture:ICompletion,IAgile,IDisposable {
 [DllImport("Mmdevapi.dll",CharSet=CharSet.Unicode)]static extern int ActivateAudioInterfaceAsync(string path,ref Guid iid,ref Variant parameters,ICompletion callback,out IOperation operation);
 readonly ManualResetEvent ready=new ManualResetEvent(false);
 readonly AutoResetEvent samples=new AutoResetEvent(false);
 IAudio audio;ICapture capture;int error;
 static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
 public Capture(int pid){
  var blob=Marshal.AllocHGlobal(12);try{
   Marshal.WriteInt32(blob,0,1);Marshal.WriteInt32(blob,4,pid);Marshal.WriteInt32(blob,8,0);
   var variant=new Variant{vt=65,size=12,data=blob};var iid=typeof(IAudio).GUID;IOperation op;
   Check(ActivateAudioInterfaceAsync("VAD\\Process_Loopback",ref iid,ref variant,this,out op));
   if(!ready.WaitOne(10000))throw new TimeoutException("音频采集启动超时");Check(error);
   var wave=new Wave{tag=1,channels=2,rate=48000,bytes=192000,align=4,bits=16};
   Check(audio.Initialize(0,unchecked((int)0x88060000),0,0,ref wave,IntPtr.Zero));
   Check(audio.Event(samples.SafeWaitHandle.DangerousGetHandle()));
   var cid=typeof(ICapture).GUID;object obj;Check(audio.Service(ref cid,out obj));capture=(ICapture)obj;
   Check(audio.Start());Marshal.ReleaseComObject(op);
  }finally{Marshal.FreeHGlobal(blob);}
 }
 public int ActivateCompleted(IOperation operation){try{object result;Check(operation.Result(out error,out result));if(error>=0)audio=(IAudio)result;}catch(Exception e){error=Marshal.GetHRForException(e);}finally{ready.Set();}return 0;}
 public byte[] Read(){uint frames;Check(capture.Next(out frames));if(frames==0)return new byte[0];IntPtr data;uint flags;ulong device,qpc;Check(capture.Buffer(out data,out frames,out flags,out device,out qpc));try{var bytes=new byte[checked((int)frames*4)];if((flags&2)==0)Marshal.Copy(data,bytes,0,bytes.Length);return bytes;}finally{Check(capture.Release(frames));}}
 public void Dispose(){if(audio!=null)audio.Stop();if(capture!=null)Marshal.ReleaseComObject(capture);if(audio!=null)Marshal.ReleaseComObject(audio);samples.Dispose();ready.Dispose();}
}
