import * as child_process from 'child_process';
import { IAction, InvalidArgument, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';

/**
 * 视频转码选项接口
 */
export interface VideoTranscodeOpts extends IActionOpts {
  fmt: string;     // 输出格式
  vcodec: string;  // 视频编码器
  acodec: string;  // 音频编码器
  abr: number;     // 音频比特率(kbps)
  profile: string; // 编码配置文件
}

export class TranscodeAction implements IAction {
  public readonly name: string = 'transcode';
  
  public validate(params: string[]): ReadOnly<VideoTranscodeOpts> {
    let opt: VideoTranscodeOpts = {
      fmt: 'mp4',       // 默认输出格式
      vcodec: 'libx264', // 默认视频编码
      acodec: 'aac',     // 默认音频编码
      abr: 128,          // 默认音频比特率
      profile: 'main',   // 默认编码配置文件
    };
    
    for (const param of params) {
      if ((this.name === param) || (!param)) {
        continue;
      }
      
      const [k, v] = param.split('_');
      if (!v) continue;
      
      switch (k) {
        case 'fmt':
          if (!['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'hls'].includes(v)) {
            throw new InvalidArgument(`Unsupported format: ${v}`);
          }
          opt.fmt = v;
          break;
          
        case 'vcodec':
          // 检查支持的视频编码器
          if (!['libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'copy'].includes(v)) {
            throw new InvalidArgument(`Unsupported video codec: ${v}`);
          }
          opt.vcodec = v;
          break;
          
        case 'acodec':
          // 检查支持的音频编码器
          if (!['aac', 'libmp3lame', 'libvorbis', 'opus', 'copy'].includes(v)) {
            throw new InvalidArgument(`Unsupported audio codec: ${v}`);
          }
          opt.acodec = v;
          break;
          
        case 'abr':
          const audioBitrate = Number(v);
          if (isNaN(audioBitrate) || audioBitrate < 32 || audioBitrate > 320) {
            throw new InvalidArgument(`Invalid audio bitrate: ${v}, must be between 32-320kbps`);
          }
          opt.abr = audioBitrate;
          break;
          
        case 'profile':
          // H.264 配置文件
          if (!['baseline', 'main', 'high'].includes(v)) {
            throw new InvalidArgument(`Unsupported profile: ${v}, must be baseline, main, or high`);
          }
          opt.profile = v;
          break;
          
        default:
          throw new InvalidArgument(`Unknown parameter: ${k}`);
      }
    }
    
    // 验证编码器和输出格式的兼容性
    this.validateCodecFormatCompatibility(opt);
    
    return opt;
  }
  
  // 验证编码器和格式的兼容性
  private validateCodecFormatCompatibility(opt: VideoTranscodeOpts): void {
    // WebM格式需要特定的编码器
    if (opt.fmt === 'webm' && opt.vcodec !== 'libvpx' && opt.vcodec !== 'libvpx-vp9' && opt.vcodec !== 'copy') {
      throw new InvalidArgument(`Format webm is incompatible with video codec ${opt.vcodec}`);
    }
    
    // 如果使用VP9编码器，只能输出为WebM或MKV
    if ((opt.vcodec === 'libvpx' || opt.vcodec === 'libvpx-vp9') && 
        !(opt.fmt === 'webm' || opt.fmt === 'mkv')) {
      throw new InvalidArgument(`Video codec ${opt.vcodec} is incompatible with format ${opt.fmt}`);
    }
    
    // 如果使用opus音频编码器，只能用于WebM、MKV或特定容器
    if (opt.acodec === 'opus' && 
        !(opt.fmt === 'webm' || opt.fmt === 'mkv')) {
      throw new InvalidArgument(`Audio codec opus is incompatible with format ${opt.fmt}`);
    }
  }
  
  public async process(ctx: IExtendedProcessContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    const url = await ctx.bufferStore.url(ctx.uri);
    
    // 构建ffmpeg命令参数
    const ffmpegArgs = this.buildFFmpegArgs(url, opt);
    
    try {
      console.log(`开始转码视频: ${ctx.uri} - ${JSON.stringify(opt)}`);
      // 执行ffmpeg处理
      const data = await this.executeFFmpeg(ffmpegArgs);
      console.log(`视频转码完成: ${ctx.uri}, 输出大小: ${data.length / (1024 * 1024)}MB`);
      
      // 设置响应数据
      ctx.result = {
        data,
        type: this.getContentType(opt.fmt)
      };
    } catch (error: any) {
      console.error(`视频转码失败: ${error.message || '未知错误'}`);
      throw error;
    }
  }
  
  private buildFFmpegArgs(url: string, opt: VideoTranscodeOpts): string[] {
    // 基本参数
    const args = [
      '-i', url,
      '-c:v', opt.vcodec
    ];
    
    // 添加视频编码器特定参数
    if (opt.vcodec === 'libx264' || opt.vcodec === 'libx265') {
      args.push('-profile:v', opt.profile);
    }
    
    // 添加音频编码参数
    args.push(
      '-c:a', opt.acodec,
      '-b:a', `${opt.abr}k`
    );
    
    // 输出格式特定参数
    if (opt.fmt === 'mp4') {
      args.push(
        '-movflags', '+faststart',
        '-f', 'mp4'
      );
    } else if (opt.fmt === 'webm') {
      args.push('-f', 'webm');
    } else if (opt.fmt === 'hls') {
      args.push(
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_list_size', '0'
      );
    } else {
      args.push('-f', opt.fmt);
    }
    
    // 输出到管道
    args.push('pipe:1');
    
    return args;
  }
  
  private getContentType(format: string): string {
    switch (format) {
      case 'mp4': return 'video/mp4';
      case 'webm': return 'video/webm';
      case 'mov': return 'video/quicktime';
      case 'avi': return 'video/x-msvideo';
      case 'mkv': return 'video/x-matroska';
      case 'flv': return 'video/x-flv';
      case 'hls': return 'application/vnd.apple.mpegurl';
      default: return 'application/octet-stream';
    }
  }
  
  private executeFFmpeg(args: string[]): Promise<Buffer> {
    console.log(`执行ffmpeg命令: ffmpeg ${args.join(' ')}`);
    const child = child_process.spawn('ffmpeg', args);
    
    return new Promise<Buffer>((resolve, reject) => {
      const _stdout: any[] = [];
      let stdoutLen = 0;
      const MAX_BUFFER = 200 * 1024 * 1024; // 200MB限制，转码可能输出较大文件
      
      // 记录stderr以便调试
      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }
      
      if (child.stdout) {
        child.stdout.on('data', function onChildStdout(chunk) {
          stdoutLen += chunk.length;
          if (stdoutLen > MAX_BUFFER) {
            child.kill('SIGTERM');
            reject(new Error('Exceed max buffer size'));
          } else {
            _stdout.push(chunk);
          }
        });
      } else {
        reject(new Error("Can't create stdout"));
        return;
      }
      
      child.on('error', (err) => {
        console.error(`FFmpeg错误: ${err.message}`);
        reject(err);
      });
      
      child.on('close', (code, signal) => {
        if (code === 0 && signal === null) {
          resolve(Buffer.concat(_stdout));
        } else {
          console.error(`FFmpeg退出码: ${code}, 信号: ${signal}`);
          console.error(`错误输出: ${stderr}`);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }
  
  public beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }
  
  public beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }
}
