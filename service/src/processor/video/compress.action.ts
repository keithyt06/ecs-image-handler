import * as child_process from 'child_process';
import { IAction, InvalidArgument, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';

/**
 * 视频压缩选项接口
 */
export interface VideoCompressOpts extends IActionOpts {
  q: number;       // 质量参数 (1-51，值越小质量越高)
  r: number;       // 输出帧率
  s: string;       // 输出尺寸 (例如: '640x480', '720p', '1080p')
  br: number;      // 比特率 (kbps)
  fmt: string;     // 输出格式 ('mp4', 'webm', 'hls')
  preset: string;  // 编码预设 ('fast', 'medium', 'slow')
}

export class CompressAction implements IAction {
  public readonly name: string = 'compress';
  
  public validate(params: string[]): ReadOnly<VideoCompressOpts> {
    let opt: VideoCompressOpts = {
      q: 23,           // 默认质量参数
      r: 30,           // 默认30fps
      s: '720p',       // 默认720p
      br: 1500,        // 默认1500kbps
      fmt: 'mp4',      // 默认mp4格式
      preset: 'medium' // 默认中等压缩速度
    };
    
    for (const param of params) {
      if ((this.name === param) || (!param)) {
        continue;
      }
      
      const [k, v] = param.split('_');
      if (!v) continue;
      
      switch (k) {
        case 'q':
          const quality = Number(v);
          if (isNaN(quality) || quality < 1 || quality > 51) {
            throw new InvalidArgument(`Invalid quality value: ${v}, must be between 1-51`);
          }
          opt.q = quality;
          break;
          
        case 'r':
          const framerate = Number(v);
          if (isNaN(framerate) || framerate < 1 || framerate > 60) {
            throw new InvalidArgument(`Invalid framerate value: ${v}, must be between 1-60`);
          }
          opt.r = framerate;
          break;
          
        case 's':
          // 支持常见分辨率或自定义尺寸
          if (!['360p', '480p', '720p', '1080p'].includes(v) && 
              !v.match(/^\d+x\d+$/)) {
            throw new InvalidArgument(`Invalid size value: ${v}`);
          }
          opt.s = v;
          break;
          
        case 'br':
          const bitrate = Number(v);
          if (isNaN(bitrate) || bitrate < 100) {
            throw new InvalidArgument(`Invalid bitrate value: ${v}`);
          }
          opt.br = bitrate;
          break;
          
        case 'fmt':
          if (!['mp4', 'webm', 'hls'].includes(v)) {
            throw new InvalidArgument(`Unsupported format: ${v}, must be mp4, webm or hls`);
          }
          opt.fmt = v;
          break;
          
        case 'preset':
          if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'].includes(v)) {
            throw new InvalidArgument(`Invalid preset: ${v}`);
          }
          opt.preset = v;
          break;
          
        default:
          throw new InvalidArgument(`Unknown parameter: ${k}`);
      }
    }
    
    return opt;
  }
  
  public async process(ctx: IExtendedProcessContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    const url = await ctx.bufferStore.url(ctx.uri);
    
    // 构建ffmpeg命令参数
    const ffmpegArgs = this.buildFFmpegArgs(url, opt);
    
    try {
      console.log(`开始压缩视频: ${ctx.uri} - ${JSON.stringify(opt)}`);
      // 执行ffmpeg处理
      const data = await this.executeFFmpeg(ffmpegArgs);
      console.log(`视频压缩完成: ${ctx.uri}, 输出大小: ${data.length / (1024 * 1024)}MB`);
      
      // 设置响应数据
      ctx.result = {
        data,
        type: this.getContentType(opt.fmt)
      };
    } catch (error: any) {
      console.error(`视频压缩失败: ${error.message || '未知错误'}`);
      throw error;
    }
  }
  
  private buildFFmpegArgs(url: string, opt: VideoCompressOpts): string[] {
    // 解析尺寸参数
    let sizeArg = opt.s;
    if (opt.s === '360p') sizeArg = '640x360';
    else if (opt.s === '480p') sizeArg = '854x480';
    else if (opt.s === '720p') sizeArg = '1280x720';
    else if (opt.s === '1080p') sizeArg = '1920x1080';
    
    // 基本参数
    const args = [
      '-i', url,
      '-c:v', 'libx264',
      '-crf', opt.q.toString(),
      '-preset', opt.preset,
      '-r', opt.r.toString(),
      '-s', sizeArg,
      '-b:v', `${opt.br}k`
    ];
    
    // 输出格式特定参数
    if (opt.fmt === 'mp4') {
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-f', 'mp4'
      );
    } else if (opt.fmt === 'webm') {
      args.push(
        '-c:v', 'libvpx',
        '-c:a', 'libvorbis',
        '-f', 'webm'
      );
    } else if (opt.fmt === 'hls') {
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_list_size', '0'
      );
    }
    
    // 添加音频处理参数
    args.push('-ac', '2'); // 双声道音频
    
    // 输出到管道
    args.push('pipe:1');
    
    return args;
  }
  
  private getContentType(format: string): string {
    switch (format) {
      case 'mp4': return 'video/mp4';
      case 'webm': return 'video/webm';
      case 'hls': return 'application/vnd.apple.mpegurl';
      default: return 'video/mp4';
    }
  }
  
  private executeFFmpeg(args: string[]): Promise<Buffer> {
    console.log(`执行ffmpeg命令: ffmpeg ${args.join(' ')}`);
    const child = child_process.spawn('ffmpeg', args);
    
    return new Promise<Buffer>((resolve, reject) => {
      const _stdout: any[] = [];
      let stdoutLen = 0;
      const MAX_BUFFER = 100 * 1024 * 1024; // 100MB限制
      
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
