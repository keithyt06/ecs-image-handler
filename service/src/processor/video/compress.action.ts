import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { IAction, InvalidArgument, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';

// 将fs的一些方法转换为Promise模式
const fsUnlink = promisify(fs.unlink);
const fsReadFile = promisify(fs.readFile);

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
  maxduration?: number; // 最大处理时长限制(秒)
}

// 视频处理限制常量
const VIDEO_LIMITS = {
  MAX_DURATION_SECONDS: 600, // 最大处理视频时长10分钟
  MAX_FILESIZE_MB: 200,      // 最大处理文件大小200MB
  LARGE_VIDEO_THRESHOLD_SECONDS: 300, // 5分钟以上视频自动使用快速预设
};

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
  
  /**
   * 使用ffprobe获取视频元数据
   * @param url 视频URL
   * @returns 包含时长、比特率等信息的元数据对象
   */
  private async getVideoMetadata(url: string): Promise<{duration: number, bitrate: number}> {
    return new Promise<{duration: number, bitrate: number}>((resolve, reject) => {
      // ffprobe命令，提取时长和比特率信息
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        url
      ];
      
      const ffprobe = child_process.spawn('ffprobe', args);
      let output = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        console.error(`ffprobe stderr: ${data}`);
      });
      
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited with code ${code}`));
          return;
        }
        
        try {
          const metadata = JSON.parse(output);
          const format = metadata.format || {};
          const duration = parseFloat(format.duration || '0');
          const bitrate = parseInt(format.bit_rate || '0', 10) / 1000; // 转为kbps
          
          console.log(`视频元数据: 时长=${duration}秒, 比特率=${bitrate}kbps`);
          resolve({ duration, bitrate });
        } catch (err) {
          reject(new Error(`解析视频元数据失败: ${err}`));
        }
      });
    });
  }
  
  /**
   * 自动调整处理选项，针对大型视频优化
   * @param opt 原处理选项
   * @param metadata 视频元数据
   * @returns 调整后的处理选项
   */
  private optimizeOptionsForLargeVideo(opt: VideoCompressOpts, metadata: {duration: number, bitrate: number}): VideoCompressOpts {
    // 创建选项副本以避免修改原始对象
    const optimizedOpt = {...opt};
    
    // 为大型视频调整参数
    if (metadata.duration > VIDEO_LIMITS.LARGE_VIDEO_THRESHOLD_SECONDS) {
      console.log(`检测到大型视频(${metadata.duration}秒)，自动优化处理参数`);
      
      // 如果用户没有明确指定预设，则使用更快的预设
      if (opt.preset === 'medium' || opt.preset === 'slow' || opt.preset === 'slower' || opt.preset === 'veryslow') {
        optimizedOpt.preset = 'veryfast';
        console.log(`自动将预设从 ${opt.preset} 调整为 veryfast`);
      }
      
      // 对于非常长的视频(超过8分钟)降低分辨率
      if (metadata.duration > 480 && (opt.s === '1080p' || opt.s === '720p')) {
        optimizedOpt.s = '480p';
        console.log(`自动将分辨率从 ${opt.s} 降低为 480p`);
      }
      
      // 限制片段长度，视频时长限制为请求的片段或系统限制中的较小者
      optimizedOpt.maxduration = opt.maxduration 
        ? Math.min(opt.maxduration, VIDEO_LIMITS.MAX_DURATION_SECONDS) 
        : VIDEO_LIMITS.MAX_DURATION_SECONDS;
    }
    
    return optimizedOpt;
  }
  
  public async process(ctx: IExtendedProcessContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    const url = await ctx.bufferStore.url(ctx.uri);
    
    try {
      // 获取视频元数据
      console.log(`获取视频元数据: ${ctx.uri}`);
      const metadata = await this.getVideoMetadata(url);
      
      // 检查视频时长限制
      if (metadata.duration > VIDEO_LIMITS.MAX_DURATION_SECONDS) {
        throw new InvalidArgument(`视频时长(${Math.floor(metadata.duration)}秒)超过处理限制(${VIDEO_LIMITS.MAX_DURATION_SECONDS}秒)`);
      }
      
      // 估计原始文件大小 (比特率 * 时长 / 8000 = MB大小)
      const estimatedSizeMB = (metadata.bitrate * metadata.duration) / 8000;
      if (estimatedSizeMB > VIDEO_LIMITS.MAX_FILESIZE_MB) {
        throw new InvalidArgument(`视频文件估计大小(${Math.floor(estimatedSizeMB)}MB)超过处理限制(${VIDEO_LIMITS.MAX_FILESIZE_MB}MB)`);
      }
      
      // 优化处理选项
      const optimizedOpt = this.optimizeOptionsForLargeVideo(opt, metadata);
      
      // 构建ffmpeg命令参数
      let ffmpegArgs = this.buildFFmpegArgs(url, optimizedOpt);
      
      // 如果需要限制处理时长，加入-t参数
      if (optimizedOpt.maxduration) {
        // 在output参数前插入-t参数
        const outputIndex = ffmpegArgs.indexOf('pipe:1');
        if (outputIndex > 0) {
          ffmpegArgs.splice(outputIndex, 0, '-t', optimizedOpt.maxduration.toString());
        }
      }
      
      console.log(`开始压缩视频: ${ctx.uri} - ${JSON.stringify(optimizedOpt)}`);
      
      // 设置超时时间为视频时长的3倍加60秒，保证有足够处理时间
      const timeoutMs = Math.min((metadata.duration * 3 + 60) * 1000, 600000); // 最多10分钟
      
      // 使用Promise.race添加超时处理
      const timeoutPromise = new Promise<Buffer>((_, reject) => {
        setTimeout(() => reject(new Error(`视频处理超时(${timeoutMs/1000}秒)`)), timeoutMs);
      });
      
      // 执行ffmpeg处理并添加超时
      const data = await Promise.race([
        this.executeFFmpeg(ffmpegArgs),
        timeoutPromise
      ]);
      
      console.log(`视频压缩完成: ${ctx.uri}, 输出大小: ${data.length / (1024 * 1024)}MB`);
      
      // 设置响应数据
      ctx.result = {
        data,
        type: this.getContentType(optimizedOpt.fmt)
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
      // 增加超时处理，避免卡死
      '-timeout', '30000000',  // 30秒连接超时
      '-analyzeduration', '15000000', // 增加分析时长
      '-probesize', '15000000', // 增加探测大小
      '-i', url,
      '-c:v', 'libx264',
      '-crf', opt.q.toString(),
      '-preset', opt.preset,
      '-r', opt.r.toString(),
      '-s', sizeArg,
      '-b:v', `${opt.br}k`
    ];
    
    // 优化处理大型视频的参数
    args.push(
      '-threads', '0',         // 自动使用最优线程数
      '-tune', 'fastdecode',   // 优化快速解码
      '-max_muxing_queue_size', '9999'  // 增加队列大小，防止错误
    );
    
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
    
    // 优化音频处理
    args.push(
      '-ac', '2',              // 双声道音频
      '-af', 'aresample=async=1' // 解决音频同步问题
    );
    
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
  
  /**
   * 根据格式确定是否需要使用临时文件处理
   * @param format 视频格式
   * @returns 是否需要使用临时文件
   */
  private requiresTempFile(format: string): boolean {
    // 不支持管道输出的格式 (主要是MP4和一些容器格式)
    const tempFileFormats = ['mp4', 'mov', 'mkv'];
    return tempFileFormats.includes(format.toLowerCase());
  }
  
  /**
   * 生成唯一的临时文件路径
   * @param format 文件格式
   * @returns 临时文件路径
   */
  private generateTempFilePath(format: string): string {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    return path.join(tempDir, `video-compress-${timestamp}-${randomString}.${format}`);
  }
  
  /**
   * 使用临时文件执行FFmpeg命令
   * @param args FFmpeg参数
   * @param format 视频格式
   * @returns 处理后的视频数据
   */
  private async executeWithTempFile(args: string[], format: string): Promise<Buffer> {
    // 生成临时文件路径
    const tempFilePath = this.generateTempFilePath(format);
    
    // 替换输出管道为临时文件
    const fileArgs = [...args.slice(0, -1), tempFilePath];
    
    console.log(`执行ffmpeg命令(临时文件模式): ffmpeg ${fileArgs.join(' ')}`);
    
    return new Promise<Buffer>((resolve, reject) => {
      const child = child_process.spawn('ffmpeg', fileArgs);
      
      // 记录stderr以便调试
      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }
      
      child.on('error', (err) => {
        console.error(`FFmpeg错误: ${err.message}`);
        // 清理临时文件
        fsUnlink(tempFilePath).catch(() => {});
        reject(err);
      });
      
      child.on('close', async (code, signal) => {
        if (code === 0 && signal === null) {
          try {
            // 读取临时文件
            const data = await fsReadFile(tempFilePath);
            // 清理临时文件
            await fsUnlink(tempFilePath);
            console.log(`临时文件已清理: ${tempFilePath}`);
            resolve(data);
          } catch (err) {
            console.error(`读取或清理临时文件失败: ${err}`);
            // 尝试清理临时文件
            fsUnlink(tempFilePath).catch(() => {});
            reject(err);
          }
        } else {
          console.error(`FFmpeg退出码: ${code}, 信号: ${signal}`);
          console.error(`错误输出: ${stderr}`);
          // 尝试清理临时文件
          fsUnlink(tempFilePath).catch(() => {});
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }
  
  /**
   * 使用管道执行FFmpeg命令
   * @param args FFmpeg参数
   * @returns 处理后的视频数据
   */
  private executePipeProcess(args: string[]): Promise<Buffer> {
    console.log(`执行ffmpeg命令(管道模式): ffmpeg ${args.join(' ')}`);
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
  
  /**
   * 根据格式选择合适的执行方式
   * @param args FFmpeg参数
   * @returns 处理后的视频数据
   */
  private executeFFmpeg(args: string[]): Promise<Buffer> {
    // 从参数中提取格式信息
    let format = 'mp4'; // 默认格式
    const formatIndex = args.indexOf('-f');
    if (formatIndex !== -1 && formatIndex + 1 < args.length) {
      format = args[formatIndex + 1];
    }
    
    // 根据格式选择处理方式
    if (this.requiresTempFile(format)) {
      console.log(`格式 ${format} 不支持管道输出，使用临时文件模式`);
      return this.executeWithTempFile(args, format);
    } else {
      console.log(`格式 ${format} 支持管道输出，使用管道模式`);
      return this.executePipeProcess(args);
    }
  }
  
  public beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }
  
  public beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }
}
