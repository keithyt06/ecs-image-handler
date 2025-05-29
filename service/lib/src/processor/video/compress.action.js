"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompressAction = void 0;
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const util_1 = require("util");
const __1 = require("..");
// 将fs的一些方法转换为Promise模式
const fsUnlink = (0, util_1.promisify)(fs.unlink);
const fsReadFile = (0, util_1.promisify)(fs.readFile);
// 视频处理限制常量
const VIDEO_LIMITS = {
    MAX_DURATION_SECONDS: 600,
    MAX_FILESIZE_MB: 200,
    LARGE_VIDEO_THRESHOLD_SECONDS: 300, // 5分钟以上视频自动使用快速预设
};
class CompressAction {
    constructor() {
        this.name = 'compress';
    }
    validate(params) {
        let opt = {
            q: 23,
            r: 30,
            s: '720p',
            br: 1500,
            fmt: 'mp4',
            preset: 'medium' // 默认中等压缩速度
        };
        for (const param of params) {
            if ((this.name === param) || (!param)) {
                continue;
            }
            const [k, v] = param.split('_');
            if (!v)
                continue;
            switch (k) {
                case 'q':
                    const quality = Number(v);
                    if (isNaN(quality) || quality < 1 || quality > 51) {
                        throw new __1.InvalidArgument(`Invalid quality value: ${v}, must be between 1-51`);
                    }
                    opt.q = quality;
                    break;
                case 'r':
                    const framerate = Number(v);
                    if (isNaN(framerate) || framerate < 1 || framerate > 60) {
                        throw new __1.InvalidArgument(`Invalid framerate value: ${v}, must be between 1-60`);
                    }
                    opt.r = framerate;
                    break;
                case 's':
                    // 支持常见分辨率或自定义尺寸
                    if (!['360p', '480p', '720p', '1080p'].includes(v) &&
                        !v.match(/^\d+x\d+$/)) {
                        throw new __1.InvalidArgument(`Invalid size value: ${v}`);
                    }
                    opt.s = v;
                    break;
                case 'br':
                    const bitrate = Number(v);
                    if (isNaN(bitrate) || bitrate < 100) {
                        throw new __1.InvalidArgument(`Invalid bitrate value: ${v}`);
                    }
                    opt.br = bitrate;
                    break;
                case 'fmt':
                    if (!['mp4', 'webm', 'hls'].includes(v)) {
                        throw new __1.InvalidArgument(`Unsupported format: ${v}, must be mp4, webm or hls`);
                    }
                    opt.fmt = v;
                    break;
                case 'preset':
                    if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'].includes(v)) {
                        throw new __1.InvalidArgument(`Invalid preset: ${v}`);
                    }
                    opt.preset = v;
                    break;
                default:
                    throw new __1.InvalidArgument(`Unknown parameter: ${k}`);
            }
        }
        return opt;
    }
    /**
     * 使用ffprobe获取视频元数据
     * @param url 视频URL
     * @returns 包含时长、比特率等信息的元数据对象
     */
    async getVideoMetadata(url) {
        return new Promise((resolve, reject) => {
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
                }
                catch (err) {
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
    optimizeOptionsForLargeVideo(opt, metadata) {
        // 创建选项副本以避免修改原始对象
        const optimizedOpt = { ...opt };
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
    async process(ctx, params) {
        const opt = this.validate(params);
        const url = await ctx.bufferStore.url(ctx.uri);
        try {
            // 获取视频元数据
            console.log(`获取视频元数据: ${ctx.uri}`);
            const metadata = await this.getVideoMetadata(url);
            // 检查视频时长限制
            if (metadata.duration > VIDEO_LIMITS.MAX_DURATION_SECONDS) {
                throw new __1.InvalidArgument(`视频时长(${Math.floor(metadata.duration)}秒)超过处理限制(${VIDEO_LIMITS.MAX_DURATION_SECONDS}秒)`);
            }
            // 估计原始文件大小 (比特率 * 时长 / 8000 = MB大小)
            const estimatedSizeMB = (metadata.bitrate * metadata.duration) / 8000;
            if (estimatedSizeMB > VIDEO_LIMITS.MAX_FILESIZE_MB) {
                throw new __1.InvalidArgument(`视频文件估计大小(${Math.floor(estimatedSizeMB)}MB)超过处理限制(${VIDEO_LIMITS.MAX_FILESIZE_MB}MB)`);
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
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`视频处理超时(${timeoutMs / 1000}秒)`)), timeoutMs);
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
        }
        catch (error) {
            console.error(`视频压缩失败: ${error.message || '未知错误'}`);
            throw error;
        }
    }
    buildFFmpegArgs(url, opt) {
        // 解析尺寸参数
        let sizeArg = opt.s;
        if (opt.s === '360p')
            sizeArg = '640x360';
        else if (opt.s === '480p')
            sizeArg = '854x480';
        else if (opt.s === '720p')
            sizeArg = '1280x720';
        else if (opt.s === '1080p')
            sizeArg = '1920x1080';
        // 基本参数
        const args = [
            // 增加超时处理，避免卡死
            '-timeout', '30000000',
            '-analyzeduration', '15000000',
            '-probesize', '15000000',
            '-i', url,
            '-c:v', 'libx264',
            '-crf', opt.q.toString(),
            '-preset', opt.preset,
            '-r', opt.r.toString(),
            '-s', sizeArg,
            '-b:v', `${opt.br}k`
        ];
        // 优化处理大型视频的参数
        args.push('-threads', '0', // 自动使用最优线程数
        '-tune', 'fastdecode', // 优化快速解码
        '-max_muxing_queue_size', '9999' // 增加队列大小，防止错误
        );
        // 输出格式特定参数
        if (opt.fmt === 'mp4') {
            args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-f', 'mp4');
        }
        else if (opt.fmt === 'webm') {
            args.push('-c:v', 'libvpx', '-c:a', 'libvorbis', '-f', 'webm');
        }
        else if (opt.fmt === 'hls') {
            args.push('-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_list_size', '0');
        }
        // 优化音频处理
        args.push('-ac', '2', // 双声道音频
        '-af', 'aresample=async=1' // 解决音频同步问题
        );
        // 输出到管道
        args.push('pipe:1');
        return args;
    }
    getContentType(format) {
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
    requiresTempFile(format) {
        // 不支持管道输出的格式 (主要是MP4和一些容器格式)
        const tempFileFormats = ['mp4', 'mov', 'mkv'];
        return tempFileFormats.includes(format.toLowerCase());
    }
    /**
     * 生成唯一的临时文件路径
     * @param format 文件格式
     * @returns 临时文件路径
     */
    generateTempFilePath(format) {
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
    async executeWithTempFile(args, format) {
        // 生成临时文件路径
        const tempFilePath = this.generateTempFilePath(format);
        // 替换输出管道为临时文件
        const fileArgs = [...args.slice(0, -1), tempFilePath];
        console.log(`执行ffmpeg命令(临时文件模式): ffmpeg ${fileArgs.join(' ')}`);
        return new Promise((resolve, reject) => {
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
                fsUnlink(tempFilePath).catch(() => { });
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
                    }
                    catch (err) {
                        console.error(`读取或清理临时文件失败: ${err}`);
                        // 尝试清理临时文件
                        fsUnlink(tempFilePath).catch(() => { });
                        reject(err);
                    }
                }
                else {
                    console.error(`FFmpeg退出码: ${code}, 信号: ${signal}`);
                    console.error(`错误输出: ${stderr}`);
                    // 尝试清理临时文件
                    fsUnlink(tempFilePath).catch(() => { });
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
    executePipeProcess(args) {
        console.log(`执行ffmpeg命令(管道模式): ffmpeg ${args.join(' ')}`);
        const child = child_process.spawn('ffmpeg', args);
        return new Promise((resolve, reject) => {
            const _stdout = [];
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
                    }
                    else {
                        _stdout.push(chunk);
                    }
                });
            }
            else {
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
                }
                else {
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
    executeFFmpeg(args) {
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
        }
        else {
            console.log(`格式 ${format} 支持管道输出，使用管道模式`);
            return this.executePipeProcess(args);
        }
    }
    beforeNewContext(_ctx, _params, _index) {
        // 不需要特殊处理
    }
    beforeProcess(_ctx, _params, _index) {
        // 不需要特殊处理
    }
}
exports.CompressAction = CompressAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHJlc3MuYWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci92aWRlby9jb21wcmVzcy5hY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQStDO0FBQy9DLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLGlDQUFpQztBQUNqQywrQkFBaUM7QUFDakMsMEJBQXFFO0FBR3JFLHVCQUF1QjtBQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3RDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0JBQVMsRUFBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7QUFlMUMsV0FBVztBQUNYLE1BQU0sWUFBWSxHQUFHO0lBQ25CLG9CQUFvQixFQUFFLEdBQUc7SUFDekIsZUFBZSxFQUFFLEdBQUc7SUFDcEIsNkJBQTZCLEVBQUUsR0FBRyxFQUFFLGtCQUFrQjtDQUN2RCxDQUFDO0FBRUYsTUFBYSxjQUFjO0lBQTNCO1FBQ2tCLFNBQUksR0FBVyxVQUFVLENBQUM7SUFpZDVDLENBQUM7SUEvY1EsUUFBUSxDQUFDLE1BQWdCO1FBQzlCLElBQUksR0FBRyxHQUFzQjtZQUMzQixDQUFDLEVBQUUsRUFBRTtZQUNMLENBQUMsRUFBRSxFQUFFO1lBQ0wsQ0FBQyxFQUFFLE1BQU07WUFDVCxFQUFFLEVBQUUsSUFBSTtZQUNSLEdBQUcsRUFBRSxLQUFLO1lBQ1YsTUFBTSxFQUFFLFFBQVEsQ0FBQyxXQUFXO1NBQzdCLENBQUM7UUFFRixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtZQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3JDLFNBQVM7YUFDVjtZQUVELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxD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TSxFQUFFO1lBQ3ZELE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQ2hDO1FBRUQsYUFBYTtRQUNiLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxNQUFNLG1CQUFtQixDQUFDLENBQUM7WUFDN0MsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQy9DO2FBQU07WUFDTCxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzFDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RDO0lBQ0gsQ0FBQztJQUVNLGdCQUFnQixDQUFDLElBQTZCLEVBQUUsT0FBaUIsRUFBRSxNQUFjO1FBQ3RGLFVBQVU7SUFDWixDQUFDO0lBRU0sYUFBYSxDQUFDLElBQTZCLEVBQUUsT0FBaUIsRUFBRSxNQUFjO1FBQ25GLFVBQVU7SUFDWixDQUFDO0NBQ0Y7QUFsZEQsd0NBa2RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgSUFjdGlvbiwgSW52YWxpZEFyZ3VtZW50LCBJQWN0aW9uT3B0cywgUmVhZE9ubHkgfSBmcm9tICcuLic7XG5pbXBvcnQgeyBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCB9IGZyb20gJy4vY29udGV4dCc7XG5cbi8vIOWwhmZz55qE5LiA5Lqb5pa55rOV6L2s5o2i5Li6UHJvbWlzZeaooeW8j1xuY29uc3QgZnNVbmxpbmsgPSBwcm9taXNpZnkoZnMudW5saW5rKTtcbmNvbnN0IGZzUmVhZEZpbGUgPSBwcm9taXNpZnkoZnMucmVhZEZpbGUpO1xuXG4vKipcbiAqIOinhumikeWOi+e8qemAiemhueaOpeWPo1xuICovXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvQ29tcHJlc3NPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBxOiBudW1iZXI7ICAgICAgIC8vIOi0qOmHj+WPguaVsCAoMS01Me+8jOWAvOi2iuWwj+i0qOmHj+i2iumrmClcbiAgcjogbnVtYmVyOyAgICAgICAvLyDovpPlh7rluKfnjodcbiAgczogc3RyaW5nOyAgICAgICAvLyDovpPlh7rlsLrlr7ggKOS+i+WmgjogJzY0MHg0ODAnLCAnNzIwcCcsICcxMDgwcCcpXG4gIGJyOiBudW1iZXI7ICAgICAgLy8g5q+U54m5546HIChrYnBzKVxuICBmbXQ6IHN0cmluZzsgICAgIC8vIOi+k+WHuuagvOW8jyAoJ21wNCcsICd3ZWJtJywgJ2hscycpXG4gIHByZXNldDogc3RyaW5nOyAgLy8g57yW56CB6aKE6K6+ICgnZmFzdCcsICdtZWRpdW0nLCAnc2xvdycpXG4gIG1heGR1cmF0aW9uPzogbnVtYmVyOyAvLyDmnIDlpKflpITnkIbml7bplb/pmZDliLYo56eSKVxufVxuXG4vLyDop4bpopHlpITnkIbpmZDliLbluLjph49cbmNvbnN0IFZJREVPX0xJTUlUUyA9IHtcbiAgTUFYX0RVUkFUSU9OX1NFQ09ORFM6IDYwMCwgLy8g5pyA5aSn5aSE55CG6KeG6aKR5pe26ZW/MTDliIbpkp9cbiAgTUFYX0ZJTEVTSVpFX01COiAyMDAsICAgICAgLy8g5pyA5aSn5aSE55CG5paH5Lu25aSn5bCPMjAwTUJcbiAgTEFSR0VfVklERU9fVEhSRVNIT0xEX1NFQ09ORFM6IDMwMCwgLy8gNeWIhumSn+S7peS4iuinhumikeiHquWKqOS9v+eUqOW/q+mAn+mihOiuvlxufTtcblxuZXhwb3J0IGNsYXNzIENvbXByZXNzQWN0aW9uIGltcGxlbWVudHMgSUFjdGlvbiB7XG4gIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcgPSAnY29tcHJlc3MnO1xuICBcbiAgcHVibGljIHZhbGlkYXRlKHBhcmFtczogc3RyaW5nW10pOiBSZWFkT25seTxWaWRlb0NvbXByZXNzT3B0cz4ge1xuICAgIGxldCBvcHQ6IFZpZGVvQ29tcHJlc3NPcHRzID0ge1xuICAgICAgcTogMjMsICAgICAgICAgICAvLyDpu5jorqTotKjph4/lj4LmlbBcbiAgICAgIHI6IDMwLCAgICAgICAgICAgLy8g6buY6K6kMzBmcHNcbiAgICAgIHM6ICc3MjBwJywgICAgICAgLy8g6buY6K6kNzIwcFxuICAgICAgYnI6IDE1MDAsICAgICAgICAvLyDpu5jorqQxNTAwa2Jwc1xuICAgICAgZm10OiAnbXA0JywgICAgICAvLyDpu5jorqRtcDTmoLzlvI9cbiAgICAgIHByZXNldDogJ21lZGl1bScgLy8g6buY6K6k5Lit562J5Y6L57yp6YCf5bqmXG4gICAgfTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IHBhcmFtIG9mIHBhcmFtcykge1xuICAgICAgaWYgKCh0aGlzLm5hbWUgPT09IHBhcmFtKSB8fCAoIXBhcmFtKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgW2ssIHZdID0gcGFyYW0uc3BsaXQoJ18nKTtcbiAgICAgIGlmICghdikgY29udGludWU7XG4gICAgICBcbiAgICAgIHN3aXRjaCAoaykge1xuICAgICAgICBjYXNlICdxJzpcbiAgICAgICAgICBjb25zdCBxdWFsaXR5ID0gTnVtYmVyKHYpO1xuICAgICAgICAgIGlmIChpc05hTihxdWFsaXR5KSB8fCBxdWFsaXR5IDwgMSB8fCBxdWFsaXR5ID4gNTEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYEludmFsaWQgcXVhbGl0eSB2YWx1ZTogJHt2fSwgbXVzdCBiZSBiZXR3ZWVuIDEtNTFgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb3B0LnEgPSBxdWFsaXR5O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIFxuICAgICAgICBjYXNlICdyJzpcbiAgICAgICAgICBjb25zdCBmcmFtZXJhdGUgPSBOdW1iZXIodik7XG4gICAgICAgICAgaWYgKGlzTmFOKGZyYW1lcmF0ZSkgfHwgZnJhbWVyYXRlIDwgMSB8fCBmcmFtZXJhdGUgPiA2MCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgSW52YWxpZCBmcmFtZXJhdGUgdmFsdWU6ICR7dn0sIG11c3QgYmUgYmV0d2VlbiAxLTYwYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9wdC5yID0gZnJhbWVyYXRlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIFxuICAgICAgICBjYXNlICdzJzpcbiAgICAgICAgICAvLyDmlK/mjIHluLjop4HliIbovqjnjofmiJboh6rlrprkuYnlsLrlr7hcbiAgICAgICAgICBpZiAoIVsnMzYwcCcsICc0ODBwJywgJzcyMHAnLCAnMTA4MHAnXS5pbmNsdWRlcyh2KSAmJiBcbiAgICAgICAgICAgICAgIXYubWF0Y2goL15cXGQreFxcZCskLykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYEludmFsaWQgc2l6ZSB2YWx1ZTogJHt2fWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvcHQucyA9IHY7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgXG4gICAgICAgIGNhc2UgJ2JyJzpcbiAgICAgICAgICBjb25zdCBiaXRyYXRlID0gTnVtYmVyKHYpO1xuICAgICAgICAgIGlmIChpc05hTihiaXRyYXRlKSB8fCBiaXRyYXRlIDwgMTAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBJbnZhbGlkIGJpdHJhdGUgdmFsdWU6ICR7dn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb3B0LmJyID0gYml0cmF0ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBcbiAgICAgICAgY2FzZSAnZm10JzpcbiAgICAgICAgICBpZiAoIVsnbXA0JywgJ3dlYm0nLCAnaGxzJ10uaW5jbHVkZXModikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYFVuc3VwcG9ydGVkIGZvcm1hdDogJHt2fSwgbXVzdCBiZSBtcDQsIHdlYm0gb3IgaGxzYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9wdC5mbXQgPSB2O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIFxuICAgICAgICBjYXNlICdwcmVzZXQnOlxuICAgICAgICAgIGlmICghWyd1bHRyYWZhc3QnLCAnc3VwZXJmYXN0JywgJ3ZlcnlmYXN0JywgJ2Zhc3RlcicsICdmYXN0JywgJ21lZGl1bScsICdzbG93JywgJ3Nsb3dlcicsICd2ZXJ5c2xvdyddLmluY2x1ZGVzKHYpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBJbnZhbGlkIHByZXNldDogJHt2fWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvcHQucHJlc2V0ID0gdjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtub3duIHBhcmFtZXRlcjogJHtrfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3B0O1xuICB9XG4gIFxuICAvKipcbiAgICog5L2/55SoZmZwcm9iZeiOt+WPluinhumikeWFg+aVsOaNrlxuICAgKiBAcGFyYW0gdXJsIOinhumikVVSTFxuICAgKiBAcmV0dXJucyDljIXlkKvml7bplb/jgIHmr5TnibnnjofnrYnkv6Hmga/nmoTlhYPmlbDmja7lr7nosaFcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZ2V0VmlkZW9NZXRhZGF0YSh1cmw6IHN0cmluZyk6IFByb21pc2U8e2R1cmF0aW9uOiBudW1iZXIsIGJpdHJhdGU6IG51bWJlcn0+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8e2R1cmF0aW9uOiBudW1iZXIsIGJpdHJhdGU6IG51bWJlcn0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIGZmcHJvYmXlkb3ku6TvvIzmj5Dlj5bml7bplb/lkozmr5Tnibnnjofkv6Hmga9cbiAgICAgIGNvbnN0IGFyZ3MgPSBbXG4gICAgICAgICctdicsICdxdWlldCcsXG4gICAgICAgICctcHJpbnRfZm9ybWF0JywgJ2pzb24nLFxuICAgICAgICAnLXNob3dfZm9ybWF0JyxcbiAgICAgICAgJy1zaG93X3N0cmVhbXMnLFxuICAgICAgICB1cmxcbiAgICAgIF07XG4gICAgICBcbiAgICAgIGNvbnN0IGZmcHJvYmUgPSBjaGlsZF9wcm9jZXNzLnNwYXduKCdmZnByb2JlJywgYXJncyk7XG4gICAgICBsZXQgb3V0cHV0ID0gJyc7XG4gICAgICBcbiAgICAgIGZmcHJvYmUuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgb3V0cHV0ICs9IGRhdGEudG9TdHJpbmcoKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBmZnByb2JlLnN0ZGVyci5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYGZmcHJvYmUgc3RkZXJyOiAke2RhdGF9YCk7XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgZmZwcm9iZS5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuICAgICAgICBpZiAoY29kZSAhPT0gMCkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYGZmcHJvYmUgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9YCkpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBtZXRhZGF0YSA9IEpTT04ucGFyc2Uob3V0cHV0KTtcbiAgICAgICAgICBjb25zdCBmb3JtYXQgPSBtZXRhZGF0YS5mb3JtYXQgfHwge307XG4gICAgICAgICAgY29uc3QgZHVyYXRpb24gPSBwYXJzZUZsb2F0KGZvcm1hdC5kdXJhdGlvbiB8fCAnMCcpO1xuICAgICAgICAgIGNvbnN0IGJpdHJhdGUgPSBwYXJzZUludChmb3JtYXQuYml0X3JhdGUgfHwgJzAnLCAxMCkgLyAxMDAwOyAvLyDovazkuLprYnBzXG4gICAgICAgICAgXG4gICAgICAgICAgY29uc29sZS5sb2coYOinhumikeWFg+aVsOaNrjog5pe26ZW/PSR7ZHVyYXRpb25956eSLCDmr5Tnibnnjoc9JHtiaXRyYXRlfWticHNgKTtcbiAgICAgICAgICByZXNvbHZlKHsgZHVyYXRpb24sIGJpdHJhdGUgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYOino+aekOinhumikeWFg+aVsOaNruWksei0pTogJHtlcnJ9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOiHquWKqOiwg+aVtOWkhOeQhumAiemhue+8jOmSiOWvueWkp+Wei+inhumikeS8mOWMllxuICAgKiBAcGFyYW0gb3B0IOWOn+WkhOeQhumAiemhuVxuICAgKiBAcGFyYW0gbWV0YWRhdGEg6KeG6aKR5YWD5pWw5o2uXG4gICAqIEByZXR1cm5zIOiwg+aVtOWQjueahOWkhOeQhumAiemhuVxuICAgKi9cbiAgcHJpdmF0ZSBvcHRpbWl6ZU9wdGlvbnNGb3JMYXJnZVZpZGVvKG9wdDogVmlkZW9Db21wcmVzc09wdHMsIG1ldGFkYXRhOiB7ZHVyYXRpb246IG51bWJlciwgYml0cmF0ZTogbnVtYmVyfSk6IFZpZGVvQ29tcHJlc3NPcHRzIHtcbiAgICAvLyDliJvlu7rpgInpobnlia/mnKzku6Xpgb/lhY3kv67mlLnljp/lp4vlr7nosaFcbiAgICBjb25zdCBvcHRpbWl6ZWRPcHQgPSB7Li4ub3B0fTtcbiAgICBcbiAgICAvLyDkuLrlpKflnovop4bpopHosIPmlbTlj4LmlbBcbiAgICBpZiAobWV0YWRhdGEuZHVyYXRpb24gPiBWSURFT19MSU1JVFMuTEFSR0VfVklERU9fVEhSRVNIT0xEX1NFQ09ORFMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDmo4DmtYvliLDlpKflnovop4bpopEoJHttZXRhZGF0YS5kdXJhdGlvbn3np5Ip77yM6Ieq5Yqo5LyY5YyW5aSE55CG5Y+C5pWwYCk7XG4gICAgICBcbiAgICAgIC8vIOWmguaenOeUqOaIt+ayoeacieaYjuehruaMh+WumumihOiuvu+8jOWImeS9v+eUqOabtOW/q+eahOmihOiuvlxuICAgICAgaWYgKG9wdC5wcmVzZXQgPT09ICdtZWRpdW0nIHx8IG9wdC5wcmVzZXQgPT09ICdzbG93JyB8fCBvcHQucHJlc2V0ID09PSAnc2xvd2VyJyB8fCBvcHQucHJlc2V0ID09PSAndmVyeXNsb3cnKSB7XG4gICAgICAgIG9wdGltaXplZE9wdC5wcmVzZXQgPSAndmVyeWZhc3QnO1xuICAgICAgICBjb25zb2xlLmxvZyhg6Ieq5Yqo5bCG6aKE6K6+5LuOICR7b3B0LnByZXNldH0g6LCD5pW05Li6IHZlcnlmYXN0YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIOWvueS6jumdnuW4uOmVv+eahOinhumikSjotoXov4c45YiG6ZKfKemZjeS9juWIhui+qOeOh1xuICAgICAgaWYgKG1ldGFkYXRhLmR1cmF0aW9uID4gNDgwICYmIChvcHQucyA9PT0gJzEwODBwJyB8fCBvcHQucyA9PT0gJzcyMHAnKSkge1xuICAgICAgICBvcHRpbWl6ZWRPcHQucyA9ICc0ODBwJztcbiAgICAgICAgY29uc29sZS5sb2coYOiHquWKqOWwhuWIhui+qOeOh+S7jiAke29wdC5zfSDpmY3kvY7kuLogNDgwcGApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyDpmZDliLbniYfmrrXplb/luqbvvIzop4bpopHml7bplb/pmZDliLbkuLror7fmsYLnmoTniYfmrrXmiJbns7vnu5/pmZDliLbkuK3nmoTovoPlsI/ogIVcbiAgICAgIG9wdGltaXplZE9wdC5tYXhkdXJhdGlvbiA9IG9wdC5tYXhkdXJhdGlvbiBcbiAgICAgICAgPyBNYXRoLm1pbihvcHQubWF4ZHVyYXRpb24sIFZJREVPX0xJTUlUUy5NQVhfRFVSQVRJT05fU0VDT05EUykgXG4gICAgICAgIDogVklERU9fTElNSVRTLk1BWF9EVVJBVElPTl9TRUNPTkRTO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3B0aW1pemVkT3B0O1xuICB9XG4gIFxuICBwdWJsaWMgYXN5bmMgcHJvY2VzcyhjdHg6IElFeHRlbmRlZFByb2Nlc3NDb250ZXh0LCBwYXJhbXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3B0ID0gdGhpcy52YWxpZGF0ZShwYXJhbXMpO1xuICAgIGNvbnN0IHVybCA9IGF3YWl0IGN0eC5idWZmZXJTdG9yZS51cmwoY3R4LnVyaSk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIC8vIOiOt+WPluinhumikeWFg+aVsOaNrlxuICAgICAgY29uc29sZS5sb2coYOiOt+WPluinhumikeWFg+aVsOaNrjogJHtjdHgudXJpfWApO1xuICAgICAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmdldFZpZGVvTWV0YWRhdGEodXJsKTtcbiAgICAgIFxuICAgICAgLy8g5qOA5p+l6KeG6aKR5pe26ZW/6ZmQ5Yi2XG4gICAgICBpZiAobWV0YWRhdGEuZHVyYXRpb24gPiBWSURFT19MSU1JVFMuTUFYX0RVUkFUSU9OX1NFQ09ORFMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChg6KeG6aKR5pe26ZW/KCR7TWF0aC5mbG9vcihtZXRhZGF0YS5kdXJhdGlvbil956eSKei2hei/h+WkhOeQhumZkOWItigke1ZJREVPX0xJTUlUUy5NQVhfRFVSQVRJT05fU0VDT05EU33np5IpYCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIOS8sOiuoeWOn+Wni+aWh+S7tuWkp+WwjyAo5q+U54m5546HICog5pe26ZW/IC8gODAwMCA9IE1C5aSn5bCPKVxuICAgICAgY29uc3QgZXN0aW1hdGVkU2l6ZU1CID0gKG1ldGFkYXRhLmJpdHJhdGUgKiBtZXRhZGF0YS5kdXJhdGlvbikgLyA4MDAwO1xuICAgICAgaWYgKGVzdGltYXRlZFNpemVNQiA+IFZJREVPX0xJTUlUUy5NQVhfRklMRVNJWkVfTUIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChg6KeG6aKR5paH5Lu25Lyw6K6h5aSn5bCPKCR7TWF0aC5mbG9vcihlc3RpbWF0ZWRTaXplTUIpfU1CKei2hei/h+WkhOeQhumZkOWItigke1ZJREVPX0xJTUlUUy5NQVhfRklMRVNJWkVfTUJ9TUIpYCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIOS8mOWMluWkhOeQhumAiemhuVxuICAgICAgY29uc3Qgb3B0aW1pemVkT3B0ID0gdGhpcy5vcHRpbWl6ZU9wdGlvbnNGb3JMYXJnZVZpZGVvKG9wdCwgbWV0YWRhdGEpO1xuICAgICAgXG4gICAgICAvLyDmnoTlu7pmZm1wZWflkb3ku6Tlj4LmlbBcbiAgICAgIGxldCBmZm1wZWdBcmdzID0gdGhpcy5idWlsZEZGbXBlZ0FyZ3ModXJsLCBvcHRpbWl6ZWRPcHQpO1xuICAgICAgXG4gICAgICAvLyDlpoLmnpzpnIDopoHpmZDliLblpITnkIbml7bplb/vvIzliqDlhaUtdOWPguaVsFxuICAgICAgaWYgKG9wdGltaXplZE9wdC5tYXhkdXJhdGlvbikge1xuICAgICAgICAvLyDlnKhvdXRwdXTlj4LmlbDliY3mj5LlhaUtdOWPguaVsFxuICAgICAgICBjb25zdCBvdXRwdXRJbmRleCA9IGZmbXBlZ0FyZ3MuaW5kZXhPZigncGlwZToxJyk7XG4gICAgICAgIGlmIChvdXRwdXRJbmRleCA+IDApIHtcbiAgICAgICAgICBmZm1wZWdBcmdzLnNwbGljZShvdXRwdXRJbmRleCwgMCwgJy10Jywgb3B0aW1pemVkT3B0Lm1heGR1cmF0aW9uLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDlvIDlp4vljovnvKnop4bpopE6ICR7Y3R4LnVyaX0gLSAke0pTT04uc3RyaW5naWZ5KG9wdGltaXplZE9wdCl9YCk7XG4gICAgICBcbiAgICAgIC8vIOiuvue9rui2heaXtuaXtumXtOS4uuinhumikeaXtumVv+eahDPlgI3liqA2MOenku+8jOS/neivgeaciei2s+Wkn+WkhOeQhuaXtumXtFxuICAgICAgY29uc3QgdGltZW91dE1zID0gTWF0aC5taW4oKG1ldGFkYXRhLmR1cmF0aW9uICogMyArIDYwKSAqIDEwMDAsIDYwMDAwMCk7IC8vIOacgOWkmjEw5YiG6ZKfXG4gICAgICBcbiAgICAgIC8vIOS9v+eUqFByb21pc2UucmFjZea3u+WKoOi2heaXtuWkhOeQhlxuICAgICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZTxCdWZmZXI+KChfLCByZWplY3QpID0+IHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKGDop4bpopHlpITnkIbotoXml7YoJHt0aW1lb3V0TXMvMTAwMH3np5IpYCkpLCB0aW1lb3V0TXMpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIOaJp+ihjGZmbXBlZ+WkhOeQhuW5tua3u+WKoOi2heaXtlxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IFByb21pc2UucmFjZShbXG4gICAgICAgIHRoaXMuZXhlY3V0ZUZGbXBlZyhmZm1wZWdBcmdzKSxcbiAgICAgICAgdGltZW91dFByb21pc2VcbiAgICAgIF0pO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg6KeG6aKR5Y6L57yp5a6M5oiQOiAke2N0eC51cml9LCDovpPlh7rlpKflsI86ICR7ZGF0YS5sZW5ndGggLyAoMTAyNCAqIDEwMjQpfU1CYCk7XG4gICAgICBcbiAgICAgIC8vIOiuvue9ruWTjeW6lOaVsOaNrlxuICAgICAgY3R4LnJlc3VsdCA9IHtcbiAgICAgICAgZGF0YSxcbiAgICAgICAgdHlwZTogdGhpcy5nZXRDb250ZW50VHlwZShvcHRpbWl6ZWRPcHQuZm10KVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDop4bpopHljovnvKnlpLHotKU6ICR7ZXJyb3IubWVzc2FnZSB8fCAn5pyq55+l6ZSZ6K+vJ31gKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBidWlsZEZGbXBlZ0FyZ3ModXJsOiBzdHJpbmcsIG9wdDogVmlkZW9Db21wcmVzc09wdHMpOiBzdHJpbmdbXSB7XG4gICAgLy8g6Kej5p6Q5bC65a+45Y+C5pWwXG4gICAgbGV0IHNpemVBcmcgPSBvcHQucztcbiAgICBpZiAob3B0LnMgPT09ICczNjBwJykgc2l6ZUFyZyA9ICc2NDB4MzYwJztcbiAgICBlbHNlIGlmIChvcHQucyA9PT0gJzQ4MHAnKSBzaXplQXJnID0gJzg1NHg0ODAnO1xuICAgIGVsc2UgaWYgKG9wdC5zID09PSAnNzIwcCcpIHNpemVBcmcgPSAnMTI4MHg3MjAnO1xuICAgIGVsc2UgaWYgKG9wdC5zID09PSAnMTA4MHAnKSBzaXplQXJnID0gJzE5MjB4MTA4MCc7XG4gICAgXG4gICAgLy8g5Z+65pys5Y+C5pWwXG4gICAgY29uc3QgYXJncyA9IFtcbiAgICAgIC8vIOWinuWKoOi2heaXtuWkhOeQhu+8jOmBv+WFjeWNoeatu1xuICAgICAgJy10aW1lb3V0JywgJzMwMDAwMDAwJywgIC8vIDMw56eS6L+e5o6l6LaF5pe2XG4gICAgICAnLWFuYWx5emVkdXJhdGlvbicsICcxNTAwMDAwMCcsIC8vIOWinuWKoOWIhuaekOaXtumVv1xuICAgICAgJy1wcm9iZXNpemUnLCAnMTUwMDAwMDAnLCAvLyDlop7liqDmjqLmtYvlpKflsI9cbiAgICAgICctaScsIHVybCxcbiAgICAgICctYzp2JywgJ2xpYngyNjQnLFxuICAgICAgJy1jcmYnLCBvcHQucS50b1N0cmluZygpLFxuICAgICAgJy1wcmVzZXQnLCBvcHQucHJlc2V0LFxuICAgICAgJy1yJywgb3B0LnIudG9TdHJpbmcoKSxcbiAgICAgICctcycsIHNpemVBcmcsXG4gICAgICAnLWI6dicsIGAke29wdC5icn1rYFxuICAgIF07XG4gICAgXG4gICAgLy8g5LyY5YyW5aSE55CG5aSn5Z6L6KeG6aKR55qE5Y+C5pWwXG4gICAgYXJncy5wdXNoKFxuICAgICAgJy10aHJlYWRzJywgJzAnLCAgICAgICAgIC8vIOiHquWKqOS9v+eUqOacgOS8mOe6v+eoi+aVsFxuICAgICAgJy10dW5lJywgJ2Zhc3RkZWNvZGUnLCAgIC8vIOS8mOWMluW/q+mAn+ino+eggVxuICAgICAgJy1tYXhfbXV4aW5nX3F1ZXVlX3NpemUnLCAnOTk5OScgIC8vIOWinuWKoOmYn+WIl+Wkp+Wwj++8jOmYsuatoumUmeivr1xuICAgICk7XG4gICAgXG4gICAgLy8g6L6T5Ye65qC85byP54m55a6a5Y+C5pWwXG4gICAgaWYgKG9wdC5mbXQgPT09ICdtcDQnKSB7XG4gICAgICBhcmdzLnB1c2goXG4gICAgICAgICctYzphJywgJ2FhYycsXG4gICAgICAgICctYjphJywgJzEyOGsnLFxuICAgICAgICAnLW1vdmZsYWdzJywgJytmYXN0c3RhcnQnLFxuICAgICAgICAnLWYnLCAnbXA0J1xuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKG9wdC5mbXQgPT09ICd3ZWJtJykge1xuICAgICAgYXJncy5wdXNoKFxuICAgICAgICAnLWM6dicsICdsaWJ2cHgnLFxuICAgICAgICAnLWM6YScsICdsaWJ2b3JiaXMnLFxuICAgICAgICAnLWYnLCAnd2VibSdcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChvcHQuZm10ID09PSAnaGxzJykge1xuICAgICAgYXJncy5wdXNoKFxuICAgICAgICAnLWM6YScsICdhYWMnLFxuICAgICAgICAnLWI6YScsICcxMjhrJyxcbiAgICAgICAgJy1mJywgJ2hscycsXG4gICAgICAgICctaGxzX3RpbWUnLCAnNCcsXG4gICAgICAgICctaGxzX3BsYXlsaXN0X3R5cGUnLCAndm9kJyxcbiAgICAgICAgJy1obHNfbGlzdF9zaXplJywgJzAnXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICAvLyDkvJjljJbpn7PpopHlpITnkIZcbiAgICBhcmdzLnB1c2goXG4gICAgICAnLWFjJywgJzInLCAgICAgICAgICAgICAgLy8g5Y+M5aOw6YGT6Z+z6aKRXG4gICAgICAnLWFmJywgJ2FyZXNhbXBsZT1hc3luYz0xJyAvLyDop6PlhrPpn7PpopHlkIzmraXpl67pophcbiAgICApO1xuICAgIFxuICAgIC8vIOi+k+WHuuWIsOeuoemBk1xuICAgIGFyZ3MucHVzaCgncGlwZToxJyk7XG4gICAgXG4gICAgcmV0dXJuIGFyZ3M7XG4gIH1cbiAgXG4gIHByaXZhdGUgZ2V0Q29udGVudFR5cGUoZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICBjYXNlICdtcDQnOiByZXR1cm4gJ3ZpZGVvL21wNCc7XG4gICAgICBjYXNlICd3ZWJtJzogcmV0dXJuICd2aWRlby93ZWJtJztcbiAgICAgIGNhc2UgJ2hscyc6IHJldHVybiAnYXBwbGljYXRpb24vdm5kLmFwcGxlLm1wZWd1cmwnO1xuICAgICAgZGVmYXVsdDogcmV0dXJuICd2aWRlby9tcDQnO1xuICAgIH1cbiAgfVxuICBcbiAgLyoqXG4gICAqIOagueaNruagvOW8j+ehruWumuaYr+WQpumcgOimgeS9v+eUqOS4tOaXtuaWh+S7tuWkhOeQhlxuICAgKiBAcGFyYW0gZm9ybWF0IOinhumikeagvOW8j1xuICAgKiBAcmV0dXJucyDmmK/lkKbpnIDopoHkvb/nlKjkuLTml7bmlofku7ZcbiAgICovXG4gIHByaXZhdGUgcmVxdWlyZXNUZW1wRmlsZShmb3JtYXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIC8vIOS4jeaUr+aMgeeuoemBk+i+k+WHuueahOagvOW8jyAo5Li76KaB5pivTVA05ZKM5LiA5Lqb5a655Zmo5qC85byPKVxuICAgIGNvbnN0IHRlbXBGaWxlRm9ybWF0cyA9IFsnbXA0JywgJ21vdicsICdta3YnXTtcbiAgICByZXR1cm4gdGVtcEZpbGVGb3JtYXRzLmluY2x1ZGVzKGZvcm1hdC50b0xvd2VyQ2FzZSgpKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOeUn+aIkOWUr+S4gOeahOS4tOaXtuaWh+S7tui3r+W+hFxuICAgKiBAcGFyYW0gZm9ybWF0IOaWh+S7tuagvOW8j1xuICAgKiBAcmV0dXJucyDkuLTml7bmlofku7bot6/lvoRcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVUZW1wRmlsZVBhdGgoZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHRlbXBEaXIgPSBvcy50bXBkaXIoKTtcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHJhbmRvbVN0cmluZyA9IGNyeXB0by5yYW5kb21CeXRlcyg4KS50b1N0cmluZygnaGV4Jyk7XG4gICAgcmV0dXJuIHBhdGguam9pbih0ZW1wRGlyLCBgdmlkZW8tY29tcHJlc3MtJHt0aW1lc3RhbXB9LSR7cmFuZG9tU3RyaW5nfS4ke2Zvcm1hdH1gKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOS9v+eUqOS4tOaXtuaWh+S7tuaJp+ihjEZGbXBlZ+WRveS7pFxuICAgKiBAcGFyYW0gYXJncyBGRm1wZWflj4LmlbBcbiAgICogQHBhcmFtIGZvcm1hdCDop4bpopHmoLzlvI9cbiAgICogQHJldHVybnMg5aSE55CG5ZCO55qE6KeG6aKR5pWw5o2uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVXaXRoVGVtcEZpbGUoYXJnczogc3RyaW5nW10sIGZvcm1hdDogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgICAvLyDnlJ/miJDkuLTml7bmlofku7bot6/lvoRcbiAgICBjb25zdCB0ZW1wRmlsZVBhdGggPSB0aGlzLmdlbmVyYXRlVGVtcEZpbGVQYXRoKGZvcm1hdCk7XG4gICAgXG4gICAgLy8g5pu/5o2i6L6T5Ye6566h6YGT5Li65Li05pe25paH5Lu2XG4gICAgY29uc3QgZmlsZUFyZ3MgPSBbLi4uYXJncy5zbGljZSgwLCAtMSksIHRlbXBGaWxlUGF0aF07XG4gICAgXG4gICAgY29uc29sZS5sb2coYOaJp+ihjGZmbXBlZ+WRveS7pCjkuLTml7bmlofku7bmqKHlvI8pOiBmZm1wZWcgJHtmaWxlQXJncy5qb2luKCcgJyl9YCk7XG4gICAgXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2hpbGQgPSBjaGlsZF9wcm9jZXNzLnNwYXduKCdmZm1wZWcnLCBmaWxlQXJncyk7XG4gICAgICBcbiAgICAgIC8vIOiusOW9lXN0ZGVycuS7peS+v+iwg+ivlVxuICAgICAgbGV0IHN0ZGVyciA9ICcnO1xuICAgICAgaWYgKGNoaWxkLnN0ZGVycikge1xuICAgICAgICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoY2h1bmspID0+IHtcbiAgICAgICAgICBzdGRlcnIgKz0gY2h1bmsudG9TdHJpbmcoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgRkZtcGVn6ZSZ6K+vOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAvLyDmuIXnkIbkuLTml7bmlofku7ZcbiAgICAgICAgZnNVbmxpbmsodGVtcEZpbGVQYXRoKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdjbG9zZScsIGFzeW5jIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgICAgaWYgKGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOivu+WPluS4tOaXtuaWh+S7tlxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZzUmVhZEZpbGUodGVtcEZpbGVQYXRoKTtcbiAgICAgICAgICAgIC8vIOa4heeQhuS4tOaXtuaWh+S7tlxuICAgICAgICAgICAgYXdhaXQgZnNVbmxpbmsodGVtcEZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDkuLTml7bmlofku7blt7LmuIXnkIY6ICR7dGVtcEZpbGVQYXRofWApO1xuICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOivu+WPluaIlua4heeQhuS4tOaXtuaWh+S7tuWksei0pTogJHtlcnJ9YCk7XG4gICAgICAgICAgICAvLyDlsJ3or5XmuIXnkIbkuLTml7bmlofku7ZcbiAgICAgICAgICAgIGZzVW5saW5rKHRlbXBGaWxlUGF0aCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZGbXBlZ+mAgOWHuueggTogJHtjb2RlfSwg5L+h5Y+3OiAke3NpZ25hbH1gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDplJnor6/ovpPlh7o6ICR7c3RkZXJyfWApO1xuICAgICAgICAgIC8vIOWwneivlea4heeQhuS4tOaXtuaWh+S7tlxuICAgICAgICAgIGZzVW5saW5rKHRlbXBGaWxlUGF0aCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZGbXBlZyBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG4gIFxuICAvKipcbiAgICog5L2/55So566h6YGT5omn6KGMRkZtcGVn5ZG95LukXG4gICAqIEBwYXJhbSBhcmdzIEZGbXBlZ+WPguaVsFxuICAgKiBAcmV0dXJucyDlpITnkIblkI7nmoTop4bpopHmlbDmja5cbiAgICovXG4gIHByaXZhdGUgZXhlY3V0ZVBpcGVQcm9jZXNzKGFyZ3M6IHN0cmluZ1tdKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgICBjb25zb2xlLmxvZyhg5omn6KGMZmZtcGVn5ZG95LukKOeuoemBk+aooeW8jyk6IGZmbXBlZyAke2FyZ3Muam9pbignICcpfWApO1xuICAgIGNvbnN0IGNoaWxkID0gY2hpbGRfcHJvY2Vzcy5zcGF3bignZmZtcGVnJywgYXJncyk7XG4gICAgXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgX3N0ZG91dDogYW55W10gPSBbXTtcbiAgICAgIGxldCBzdGRvdXRMZW4gPSAwO1xuICAgICAgY29uc3QgTUFYX0JVRkZFUiA9IDEwMCAqIDEwMjQgKiAxMDI0OyAvLyAxMDBNQumZkOWItlxuICAgICAgXG4gICAgICAvLyDorrDlvZVzdGRlcnLku6Xkvr/osIPor5VcbiAgICAgIGxldCBzdGRlcnIgPSAnJztcbiAgICAgIGlmIChjaGlsZC5zdGRlcnIpIHtcbiAgICAgICAgY2hpbGQuc3RkZXJyLm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICAgICAgc3RkZXJyICs9IGNodW5rLnRvU3RyaW5nKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoY2hpbGQuc3Rkb3V0KSB7XG4gICAgICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIGZ1bmN0aW9uIG9uQ2hpbGRTdGRvdXQoY2h1bmspIHtcbiAgICAgICAgICBzdGRvdXRMZW4gKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgICAgIGlmIChzdGRvdXRMZW4gPiBNQVhfQlVGRkVSKSB7XG4gICAgICAgICAgICBjaGlsZC5raWxsKCdTSUdURVJNJyk7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdFeGNlZWQgbWF4IGJ1ZmZlciBzaXplJykpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBfc3Rkb3V0LnB1c2goY2h1bmspO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKFwiQ2FuJ3QgY3JlYXRlIHN0ZG91dFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY2hpbGQub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBGRm1wZWfplJnor686ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdjbG9zZScsIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgICAgaWYgKGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgICAgcmVzb2x2ZShCdWZmZXIuY29uY2F0KF9zdGRvdXQpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBGRm1wZWfpgIDlh7rnoIE6ICR7Y29kZX0sIOS/oeWPtzogJHtzaWduYWx9YCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihg6ZSZ6K+v6L6T5Ye6OiAke3N0ZGVycn1gKTtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGRm1wZWcgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOagueaNruagvOW8j+mAieaLqeWQiOmAgueahOaJp+ihjOaWueW8j1xuICAgKiBAcGFyYW0gYXJncyBGRm1wZWflj4LmlbBcbiAgICogQHJldHVybnMg5aSE55CG5ZCO55qE6KeG6aKR5pWw5o2uXG4gICAqL1xuICBwcml2YXRlIGV4ZWN1dGVGRm1wZWcoYXJnczogc3RyaW5nW10pOiBQcm9taXNlPEJ1ZmZlcj4ge1xuICAgIC8vIOS7juWPguaVsOS4reaPkOWPluagvOW8j+S/oeaBr1xuICAgIGxldCBmb3JtYXQgPSAnbXA0JzsgLy8g6buY6K6k5qC85byPXG4gICAgY29uc3QgZm9ybWF0SW5kZXggPSBhcmdzLmluZGV4T2YoJy1mJyk7XG4gICAgaWYgKGZvcm1hdEluZGV4ICE9PSAtMSAmJiBmb3JtYXRJbmRleCArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgZm9ybWF0ID0gYXJnc1tmb3JtYXRJbmRleCArIDFdO1xuICAgIH1cbiAgICBcbiAgICAvLyDmoLnmja7moLzlvI/pgInmi6nlpITnkIbmlrnlvI9cbiAgICBpZiAodGhpcy5yZXF1aXJlc1RlbXBGaWxlKGZvcm1hdCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDmoLzlvI8gJHtmb3JtYXR9IOS4jeaUr+aMgeeuoemBk+i+k+WHuu+8jOS9v+eUqOS4tOaXtuaWh+S7tuaooeW8j2ApO1xuICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVdpdGhUZW1wRmlsZShhcmdzLCBmb3JtYXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg5qC85byPICR7Zm9ybWF0fSDmlK/mjIHnrqHpgZPovpPlh7rvvIzkvb/nlKjnrqHpgZPmqKHlvI9gKTtcbiAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVQaXBlUHJvY2VzcyhhcmdzKTtcbiAgICB9XG4gIH1cbiAgXG4gIHB1YmxpYyBiZWZvcmVOZXdDb250ZXh0KF9jdHg6IElFeHRlbmRlZFByb2Nlc3NDb250ZXh0LCBfcGFyYW1zOiBzdHJpbmdbXSwgX2luZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyDkuI3pnIDopoHnibnmrorlpITnkIZcbiAgfVxuICBcbiAgcHVibGljIGJlZm9yZVByb2Nlc3MoX2N0eDogSUV4dGVuZGVkUHJvY2Vzc0NvbnRleHQsIF9wYXJhbXM6IHN0cmluZ1tdLCBfaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIC8vIOS4jemcgOimgeeJueauiuWkhOeQhlxuICB9XG59XG4iXX0=