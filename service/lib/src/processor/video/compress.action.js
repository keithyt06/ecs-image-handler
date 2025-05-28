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
    async process(ctx, params) {
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
            args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-f', 'mp4');
        }
        else if (opt.fmt === 'webm') {
            args.push('-c:v', 'libvpx', '-c:a', 'libvorbis', '-f', 'webm');
        }
        else if (opt.fmt === 'hls') {
            args.push('-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_list_size', '0');
        }
        // 添加音频处理参数
        args.push('-ac', '2'); // 双声道音频
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHJlc3MuYWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci92aWRlby9jb21wcmVzcy5hY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQStDO0FBQy9DLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLGlDQUFpQztBQUNqQywrQkFBaUM7QUFDakMsMEJBQXFFO0FBR3JFLHVCQUF1QjtBQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3RDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0JBQVMsRUFBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7QUFjMUMsTUFBYSxjQUFjO0lBQTNCO1FBQ2tCLFNBQUksR0FBVyxVQUFVLENBQUM7SUF3VTVDLENBQUM7SUF0VVEsUUFBUSxDQUFDLE1BQWdCO1FBQzlCLElBQUksR0FBRyxHQUFzQjtZQUMzQixDQUFDLEVBQUUsRUFBRTtZQUNMLENBQUMsRUFBRSxFQUFFO1lBQ0wsQ0FBQyxFQUFFLE1BQU07WUFDVCxFQUFFLEVBQUUsSUFBSTtZQUNSLEdBQUcsRUFBRSxLQUFLO1lBQ1YsTUFBTSxFQUFFLFFBQVEsQ0FBQyxXQUFXO1NBQzdCLENBQUM7UUFFRixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtZQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3JDLFNBQVM7YUFDVjtZQUVELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxJQUFJLENBQUMsQ0FBQztnQkFBRSxTQUFTO1lBRWpCLFFBQVEsQ0FBQyxFQUFFO2dCQUNULEtBQUssR0FBRztvQkFDTixN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RyxDQUFDLE1BQU0sTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzFDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RDO0lBQ0gsQ0FBQztJQUVNLGdCQUFnQixDQUFDLElBQTZCLEVBQUUsT0FBaUIsRUFBRSxNQUFjO1FBQ3RGLFVBQVU7SUFDWixDQUFDO0lBRU0sYUFBYSxDQUFDLElBQTZCLEVBQUUsT0FBaUIsRUFBRSxNQUFjO1FBQ25GLFVBQVU7SUFDWixDQUFDO0NBQ0Y7QUF6VUQsd0NBeVVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgSUFjdGlvbiwgSW52YWxpZEFyZ3VtZW50LCBJQWN0aW9uT3B0cywgUmVhZE9ubHkgfSBmcm9tICcuLic7XG5pbXBvcnQgeyBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCB9IGZyb20gJy4vY29udGV4dCc7XG5cbi8vIOWwhmZz55qE5LiA5Lqb5pa55rOV6L2s5o2i5Li6UHJvbWlzZeaooeW8j1xuY29uc3QgZnNVbmxpbmsgPSBwcm9taXNpZnkoZnMudW5saW5rKTtcbmNvbnN0IGZzUmVhZEZpbGUgPSBwcm9taXNpZnkoZnMucmVhZEZpbGUpO1xuXG4vKipcbiAqIOinhumikeWOi+e8qemAiemhueaOpeWPo1xuICovXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvQ29tcHJlc3NPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBxOiBudW1iZXI7ICAgICAgIC8vIOi0qOmHj+WPguaVsCAoMS01Me+8jOWAvOi2iuWwj+i0qOmHj+i2iumrmClcbiAgcjogbnVtYmVyOyAgICAgICAvLyDovpPlh7rluKfnjodcbiAgczogc3RyaW5nOyAgICAgICAvLyDovpPlh7rlsLrlr7ggKOS+i+WmgjogJzY0MHg0ODAnLCAnNzIwcCcsICcxMDgwcCcpXG4gIGJyOiBudW1iZXI7ICAgICAgLy8g5q+U54m5546HIChrYnBzKVxuICBmbXQ6IHN0cmluZzsgICAgIC8vIOi+k+WHuuagvOW8jyAoJ21wNCcsICd3ZWJtJywgJ2hscycpXG4gIHByZXNldDogc3RyaW5nOyAgLy8g57yW56CB6aKE6K6+ICgnZmFzdCcsICdtZWRpdW0nLCAnc2xvdycpXG59XG5cbmV4cG9ydCBjbGFzcyBDb21wcmVzc0FjdGlvbiBpbXBsZW1lbnRzIElBY3Rpb24ge1xuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ2NvbXByZXNzJztcbiAgXG4gIHB1YmxpYyB2YWxpZGF0ZShwYXJhbXM6IHN0cmluZ1tdKTogUmVhZE9ubHk8VmlkZW9Db21wcmVzc09wdHM+IHtcbiAgICBsZXQgb3B0OiBWaWRlb0NvbXByZXNzT3B0cyA9IHtcbiAgICAgIHE6IDIzLCAgICAgICAgICAgLy8g6buY6K6k6LSo6YeP5Y+C5pWwXG4gICAgICByOiAzMCwgICAgICAgICAgIC8vIOm7mOiupDMwZnBzXG4gICAgICBzOiAnNzIwcCcsICAgICAgIC8vIOm7mOiupDcyMHBcbiAgICAgIGJyOiAxNTAwLCAgICAgICAgLy8g6buY6K6kMTUwMGticHNcbiAgICAgIGZtdDogJ21wNCcsICAgICAgLy8g6buY6K6kbXA05qC85byPXG4gICAgICBwcmVzZXQ6ICdtZWRpdW0nIC8vIOm7mOiupOS4reetieWOi+e8qemAn+W6plxuICAgIH07XG4gICAgXG4gICAgZm9yIChjb25zdCBwYXJhbSBvZiBwYXJhbXMpIHtcbiAgICAgIGlmICgodGhpcy5uYW1lID09PSBwYXJhbSkgfHwgKCFwYXJhbSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IFtrLCB2XSA9IHBhcmFtLnNwbGl0KCdfJyk7XG4gICAgICBpZiAoIXYpIGNvbnRpbnVlO1xuICAgICAgXG4gICAgICBzd2l0Y2ggKGspIHtcbiAgICAgICAgY2FzZSAncSc6XG4gICAgICAgICAgY29uc3QgcXVhbGl0eSA9IE51bWJlcih2KTtcbiAgICAgICAgICBpZiAoaXNOYU4ocXVhbGl0eSkgfHwgcXVhbGl0eSA8IDEgfHwgcXVhbGl0eSA+IDUxKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBJbnZhbGlkIHF1YWxpdHkgdmFsdWU6ICR7dn0sIG11c3QgYmUgYmV0d2VlbiAxLTUxYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9wdC5xID0gcXVhbGl0eTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBcbiAgICAgICAgY2FzZSAncic6XG4gICAgICAgICAgY29uc3QgZnJhbWVyYXRlID0gTnVtYmVyKHYpO1xuICAgICAgICAgIGlmIChpc05hTihmcmFtZXJhdGUpIHx8IGZyYW1lcmF0ZSA8IDEgfHwgZnJhbWVyYXRlID4gNjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYEludmFsaWQgZnJhbWVyYXRlIHZhbHVlOiAke3Z9LCBtdXN0IGJlIGJldHdlZW4gMS02MGApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvcHQuciA9IGZyYW1lcmF0ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBcbiAgICAgICAgY2FzZSAncyc6XG4gICAgICAgICAgLy8g5pSv5oyB5bi46KeB5YiG6L6o546H5oiW6Ieq5a6a5LmJ5bC65a+4XG4gICAgICAgICAgaWYgKCFbJzM2MHAnLCAnNDgwcCcsICc3MjBwJywgJzEwODBwJ10uaW5jbHVkZXModikgJiYgXG4gICAgICAgICAgICAgICF2Lm1hdGNoKC9eXFxkK3hcXGQrJC8pKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBJbnZhbGlkIHNpemUgdmFsdWU6ICR7dn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb3B0LnMgPSB2O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIFxuICAgICAgICBjYXNlICdicic6XG4gICAgICAgICAgY29uc3QgYml0cmF0ZSA9IE51bWJlcih2KTtcbiAgICAgICAgICBpZiAoaXNOYU4oYml0cmF0ZSkgfHwgYml0cmF0ZSA8IDEwMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgSW52YWxpZCBiaXRyYXRlIHZhbHVlOiAke3Z9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9wdC5iciA9IGJpdHJhdGU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgXG4gICAgICAgIGNhc2UgJ2ZtdCc6XG4gICAgICAgICAgaWYgKCFbJ21wNCcsICd3ZWJtJywgJ2hscyddLmluY2x1ZGVzKHYpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbnN1cHBvcnRlZCBmb3JtYXQ6ICR7dn0sIG11c3QgYmUgbXA0LCB3ZWJtIG9yIGhsc2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvcHQuZm10ID0gdjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBcbiAgICAgICAgY2FzZSAncHJlc2V0JzpcbiAgICAgICAgICBpZiAoIVsndWx0cmFmYXN0JywgJ3N1cGVyZmFzdCcsICd2ZXJ5ZmFzdCcsICdmYXN0ZXInLCAnZmFzdCcsICdtZWRpdW0nLCAnc2xvdycsICdzbG93ZXInLCAndmVyeXNsb3cnXS5pbmNsdWRlcyh2KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgSW52YWxpZCBwcmVzZXQ6ICR7dn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb3B0LnByZXNldCA9IHY7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgVW5rbm93biBwYXJhbWV0ZXI6ICR7a31gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuICBcbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCwgcGFyYW1zOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG9wdCA9IHRoaXMudmFsaWRhdGUocGFyYW1zKTtcbiAgICBjb25zdCB1cmwgPSBhd2FpdCBjdHguYnVmZmVyU3RvcmUudXJsKGN0eC51cmkpO1xuICAgIFxuICAgIC8vIOaehOW7umZmbXBlZ+WRveS7pOWPguaVsFxuICAgIGNvbnN0IGZmbXBlZ0FyZ3MgPSB0aGlzLmJ1aWxkRkZtcGVnQXJncyh1cmwsIG9wdCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDlvIDlp4vljovnvKnop4bpopE6ICR7Y3R4LnVyaX0gLSAke0pTT04uc3RyaW5naWZ5KG9wdCl9YCk7XG4gICAgICAvLyDmiafooYxmZm1wZWflpITnkIZcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLmV4ZWN1dGVGRm1wZWcoZmZtcGVnQXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg6KeG6aKR5Y6L57yp5a6M5oiQOiAke2N0eC51cml9LCDovpPlh7rlpKflsI86ICR7ZGF0YS5sZW5ndGggLyAoMTAyNCAqIDEwMjQpfU1CYCk7XG4gICAgICBcbiAgICAgIC8vIOiuvue9ruWTjeW6lOaVsOaNrlxuICAgICAgY3R4LnJlc3VsdCA9IHtcbiAgICAgICAgZGF0YSxcbiAgICAgICAgdHlwZTogdGhpcy5nZXRDb250ZW50VHlwZShvcHQuZm10KVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDop4bpopHljovnvKnlpLHotKU6ICR7ZXJyb3IubWVzc2FnZSB8fCAn5pyq55+l6ZSZ6K+vJ31gKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBidWlsZEZGbXBlZ0FyZ3ModXJsOiBzdHJpbmcsIG9wdDogVmlkZW9Db21wcmVzc09wdHMpOiBzdHJpbmdbXSB7XG4gICAgLy8g6Kej5p6Q5bC65a+45Y+C5pWwXG4gICAgbGV0IHNpemVBcmcgPSBvcHQucztcbiAgICBpZiAob3B0LnMgPT09ICczNjBwJykgc2l6ZUFyZyA9ICc2NDB4MzYwJztcbiAgICBlbHNlIGlmIChvcHQucyA9PT0gJzQ4MHAnKSBzaXplQXJnID0gJzg1NHg0ODAnO1xuICAgIGVsc2UgaWYgKG9wdC5zID09PSAnNzIwcCcpIHNpemVBcmcgPSAnMTI4MHg3MjAnO1xuICAgIGVsc2UgaWYgKG9wdC5zID09PSAnMTA4MHAnKSBzaXplQXJnID0gJzE5MjB4MTA4MCc7XG4gICAgXG4gICAgLy8g5Z+65pys5Y+C5pWwXG4gICAgY29uc3QgYXJncyA9IFtcbiAgICAgICctaScsIHVybCxcbiAgICAgICctYzp2JywgJ2xpYngyNjQnLFxuICAgICAgJy1jcmYnLCBvcHQucS50b1N0cmluZygpLFxuICAgICAgJy1wcmVzZXQnLCBvcHQucHJlc2V0LFxuICAgICAgJy1yJywgb3B0LnIudG9TdHJpbmcoKSxcbiAgICAgICctcycsIHNpemVBcmcsXG4gICAgICAnLWI6dicsIGAke29wdC5icn1rYFxuICAgIF07XG4gICAgXG4gICAgLy8g6L6T5Ye65qC85byP54m55a6a5Y+C5pWwXG4gICAgaWYgKG9wdC5mbXQgPT09ICdtcDQnKSB7XG4gICAgICBhcmdzLnB1c2goXG4gICAgICAgICctYzphJywgJ2FhYycsXG4gICAgICAgICctYjphJywgJzEyOGsnLFxuICAgICAgICAnLW1vdmZsYWdzJywgJytmYXN0c3RhcnQnLFxuICAgICAgICAnLWYnLCAnbXA0J1xuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKG9wdC5mbXQgPT09ICd3ZWJtJykge1xuICAgICAgYXJncy5wdXNoKFxuICAgICAgICAnLWM6dicsICdsaWJ2cHgnLFxuICAgICAgICAnLWM6YScsICdsaWJ2b3JiaXMnLFxuICAgICAgICAnLWYnLCAnd2VibSdcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChvcHQuZm10ID09PSAnaGxzJykge1xuICAgICAgYXJncy5wdXNoKFxuICAgICAgICAnLWM6YScsICdhYWMnLFxuICAgICAgICAnLWI6YScsICcxMjhrJyxcbiAgICAgICAgJy1mJywgJ2hscycsXG4gICAgICAgICctaGxzX3RpbWUnLCAnNCcsXG4gICAgICAgICctaGxzX3BsYXlsaXN0X3R5cGUnLCAndm9kJyxcbiAgICAgICAgJy1obHNfbGlzdF9zaXplJywgJzAnXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICAvLyDmt7vliqDpn7PpopHlpITnkIblj4LmlbBcbiAgICBhcmdzLnB1c2goJy1hYycsICcyJyk7IC8vIOWPjOWjsOmBk+mfs+mikVxuICAgIFxuICAgIC8vIOi+k+WHuuWIsOeuoemBk1xuICAgIGFyZ3MucHVzaCgncGlwZToxJyk7XG4gICAgXG4gICAgcmV0dXJuIGFyZ3M7XG4gIH1cbiAgXG4gIHByaXZhdGUgZ2V0Q29udGVudFR5cGUoZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICBjYXNlICdtcDQnOiByZXR1cm4gJ3ZpZGVvL21wNCc7XG4gICAgICBjYXNlICd3ZWJtJzogcmV0dXJuICd2aWRlby93ZWJtJztcbiAgICAgIGNhc2UgJ2hscyc6IHJldHVybiAnYXBwbGljYXRpb24vdm5kLmFwcGxlLm1wZWd1cmwnO1xuICAgICAgZGVmYXVsdDogcmV0dXJuICd2aWRlby9tcDQnO1xuICAgIH1cbiAgfVxuICBcbiAgLyoqXG4gICAqIOagueaNruagvOW8j+ehruWumuaYr+WQpumcgOimgeS9v+eUqOS4tOaXtuaWh+S7tuWkhOeQhlxuICAgKiBAcGFyYW0gZm9ybWF0IOinhumikeagvOW8j1xuICAgKiBAcmV0dXJucyDmmK/lkKbpnIDopoHkvb/nlKjkuLTml7bmlofku7ZcbiAgICovXG4gIHByaXZhdGUgcmVxdWlyZXNUZW1wRmlsZShmb3JtYXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIC8vIOS4jeaUr+aMgeeuoemBk+i+k+WHuueahOagvOW8jyAo5Li76KaB5pivTVA05ZKM5LiA5Lqb5a655Zmo5qC85byPKVxuICAgIGNvbnN0IHRlbXBGaWxlRm9ybWF0cyA9IFsnbXA0JywgJ21vdicsICdta3YnXTtcbiAgICByZXR1cm4gdGVtcEZpbGVGb3JtYXRzLmluY2x1ZGVzKGZvcm1hdC50b0xvd2VyQ2FzZSgpKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOeUn+aIkOWUr+S4gOeahOS4tOaXtuaWh+S7tui3r+W+hFxuICAgKiBAcGFyYW0gZm9ybWF0IOaWh+S7tuagvOW8j1xuICAgKiBAcmV0dXJucyDkuLTml7bmlofku7bot6/lvoRcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVUZW1wRmlsZVBhdGgoZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHRlbXBEaXIgPSBvcy50bXBkaXIoKTtcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHJhbmRvbVN0cmluZyA9IGNyeXB0by5yYW5kb21CeXRlcyg4KS50b1N0cmluZygnaGV4Jyk7XG4gICAgcmV0dXJuIHBhdGguam9pbih0ZW1wRGlyLCBgdmlkZW8tY29tcHJlc3MtJHt0aW1lc3RhbXB9LSR7cmFuZG9tU3RyaW5nfS4ke2Zvcm1hdH1gKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOS9v+eUqOS4tOaXtuaWh+S7tuaJp+ihjEZGbXBlZ+WRveS7pFxuICAgKiBAcGFyYW0gYXJncyBGRm1wZWflj4LmlbBcbiAgICogQHBhcmFtIGZvcm1hdCDop4bpopHmoLzlvI9cbiAgICogQHJldHVybnMg5aSE55CG5ZCO55qE6KeG6aKR5pWw5o2uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVXaXRoVGVtcEZpbGUoYXJnczogc3RyaW5nW10sIGZvcm1hdDogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgICAvLyDnlJ/miJDkuLTml7bmlofku7bot6/lvoRcbiAgICBjb25zdCB0ZW1wRmlsZVBhdGggPSB0aGlzLmdlbmVyYXRlVGVtcEZpbGVQYXRoKGZvcm1hdCk7XG4gICAgXG4gICAgLy8g5pu/5o2i6L6T5Ye6566h6YGT5Li65Li05pe25paH5Lu2XG4gICAgY29uc3QgZmlsZUFyZ3MgPSBbLi4uYXJncy5zbGljZSgwLCAtMSksIHRlbXBGaWxlUGF0aF07XG4gICAgXG4gICAgY29uc29sZS5sb2coYOaJp+ihjGZmbXBlZ+WRveS7pCjkuLTml7bmlofku7bmqKHlvI8pOiBmZm1wZWcgJHtmaWxlQXJncy5qb2luKCcgJyl9YCk7XG4gICAgXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2hpbGQgPSBjaGlsZF9wcm9jZXNzLnNwYXduKCdmZm1wZWcnLCBmaWxlQXJncyk7XG4gICAgICBcbiAgICAgIC8vIOiusOW9lXN0ZGVycuS7peS+v+iwg+ivlVxuICAgICAgbGV0IHN0ZGVyciA9ICcnO1xuICAgICAgaWYgKGNoaWxkLnN0ZGVycikge1xuICAgICAgICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoY2h1bmspID0+IHtcbiAgICAgICAgICBzdGRlcnIgKz0gY2h1bmsudG9TdHJpbmcoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgRkZtcGVn6ZSZ6K+vOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAvLyDmuIXnkIbkuLTml7bmlofku7ZcbiAgICAgICAgZnNVbmxpbmsodGVtcEZpbGVQYXRoKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdjbG9zZScsIGFzeW5jIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgICAgaWYgKGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOivu+WPluS4tOaXtuaWh+S7tlxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZzUmVhZEZpbGUodGVtcEZpbGVQYXRoKTtcbiAgICAgICAgICAgIC8vIOa4heeQhuS4tOaXtuaWh+S7tlxuICAgICAgICAgICAgYXdhaXQgZnNVbmxpbmsodGVtcEZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDkuLTml7bmlofku7blt7LmuIXnkIY6ICR7dGVtcEZpbGVQYXRofWApO1xuICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOivu+WPluaIlua4heeQhuS4tOaXtuaWh+S7tuWksei0pTogJHtlcnJ9YCk7XG4gICAgICAgICAgICAvLyDlsJ3or5XmuIXnkIbkuLTml7bmlofku7ZcbiAgICAgICAgICAgIGZzVW5saW5rKHRlbXBGaWxlUGF0aCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZGbXBlZ+mAgOWHuueggTogJHtjb2RlfSwg5L+h5Y+3OiAke3NpZ25hbH1gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDplJnor6/ovpPlh7o6ICR7c3RkZXJyfWApO1xuICAgICAgICAgIC8vIOWwneivlea4heeQhuS4tOaXtuaWh+S7tlxuICAgICAgICAgIGZzVW5saW5rKHRlbXBGaWxlUGF0aCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZGbXBlZyBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG4gIFxuICAvKipcbiAgICog5L2/55So566h6YGT5omn6KGMRkZtcGVn5ZG95LukXG4gICAqIEBwYXJhbSBhcmdzIEZGbXBlZ+WPguaVsFxuICAgKiBAcmV0dXJucyDlpITnkIblkI7nmoTop4bpopHmlbDmja5cbiAgICovXG4gIHByaXZhdGUgZXhlY3V0ZVBpcGVQcm9jZXNzKGFyZ3M6IHN0cmluZ1tdKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgICBjb25zb2xlLmxvZyhg5omn6KGMZmZtcGVn5ZG95LukKOeuoemBk+aooeW8jyk6IGZmbXBlZyAke2FyZ3Muam9pbignICcpfWApO1xuICAgIGNvbnN0IGNoaWxkID0gY2hpbGRfcHJvY2Vzcy5zcGF3bignZmZtcGVnJywgYXJncyk7XG4gICAgXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgX3N0ZG91dDogYW55W10gPSBbXTtcbiAgICAgIGxldCBzdGRvdXRMZW4gPSAwO1xuICAgICAgY29uc3QgTUFYX0JVRkZFUiA9IDEwMCAqIDEwMjQgKiAxMDI0OyAvLyAxMDBNQumZkOWItlxuICAgICAgXG4gICAgICAvLyDorrDlvZVzdGRlcnLku6Xkvr/osIPor5VcbiAgICAgIGxldCBzdGRlcnIgPSAnJztcbiAgICAgIGlmIChjaGlsZC5zdGRlcnIpIHtcbiAgICAgICAgY2hpbGQuc3RkZXJyLm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICAgICAgc3RkZXJyICs9IGNodW5rLnRvU3RyaW5nKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoY2hpbGQuc3Rkb3V0KSB7XG4gICAgICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIGZ1bmN0aW9uIG9uQ2hpbGRTdGRvdXQoY2h1bmspIHtcbiAgICAgICAgICBzdGRvdXRMZW4gKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgICAgIGlmIChzdGRvdXRMZW4gPiBNQVhfQlVGRkVSKSB7XG4gICAgICAgICAgICBjaGlsZC5raWxsKCdTSUdURVJNJyk7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdFeGNlZWQgbWF4IGJ1ZmZlciBzaXplJykpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBfc3Rkb3V0LnB1c2goY2h1bmspO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKFwiQ2FuJ3QgY3JlYXRlIHN0ZG91dFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY2hpbGQub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBGRm1wZWfplJnor686ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNoaWxkLm9uKCdjbG9zZScsIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgICAgaWYgKGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgICAgcmVzb2x2ZShCdWZmZXIuY29uY2F0KF9zdGRvdXQpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBGRm1wZWfpgIDlh7rnoIE6ICR7Y29kZX0sIOS/oeWPtzogJHtzaWduYWx9YCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihg6ZSZ6K+v6L6T5Ye6OiAke3N0ZGVycn1gKTtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGRm1wZWcgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIOagueaNruagvOW8j+mAieaLqeWQiOmAgueahOaJp+ihjOaWueW8j1xuICAgKiBAcGFyYW0gYXJncyBGRm1wZWflj4LmlbBcbiAgICogQHJldHVybnMg5aSE55CG5ZCO55qE6KeG6aKR5pWw5o2uXG4gICAqL1xuICBwcml2YXRlIGV4ZWN1dGVGRm1wZWcoYXJnczogc3RyaW5nW10pOiBQcm9taXNlPEJ1ZmZlcj4ge1xuICAgIC8vIOS7juWPguaVsOS4reaPkOWPluagvOW8j+S/oeaBr1xuICAgIGxldCBmb3JtYXQgPSAnbXA0JzsgLy8g6buY6K6k5qC85byPXG4gICAgY29uc3QgZm9ybWF0SW5kZXggPSBhcmdzLmluZGV4T2YoJy1mJyk7XG4gICAgaWYgKGZvcm1hdEluZGV4ICE9PSAtMSAmJiBmb3JtYXRJbmRleCArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgZm9ybWF0ID0gYXJnc1tmb3JtYXRJbmRleCArIDFdO1xuICAgIH1cbiAgICBcbiAgICAvLyDmoLnmja7moLzlvI/pgInmi6nlpITnkIbmlrnlvI9cbiAgICBpZiAodGhpcy5yZXF1aXJlc1RlbXBGaWxlKGZvcm1hdCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDmoLzlvI8gJHtmb3JtYXR9IOS4jeaUr+aMgeeuoemBk+i+k+WHuu+8jOS9v+eUqOS4tOaXtuaWh+S7tuaooeW8j2ApO1xuICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVdpdGhUZW1wRmlsZShhcmdzLCBmb3JtYXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg5qC85byPICR7Zm9ybWF0fSDmlK/mjIHnrqHpgZPovpPlh7rvvIzkvb/nlKjnrqHpgZPmqKHlvI9gKTtcbiAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVQaXBlUHJvY2VzcyhhcmdzKTtcbiAgICB9XG4gIH1cbiAgXG4gIHB1YmxpYyBiZWZvcmVOZXdDb250ZXh0KF9jdHg6IElFeHRlbmRlZFByb2Nlc3NDb250ZXh0LCBfcGFyYW1zOiBzdHJpbmdbXSwgX2luZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyDkuI3pnIDopoHnibnmrorlpITnkIZcbiAgfVxuICBcbiAgcHVibGljIGJlZm9yZVByb2Nlc3MoX2N0eDogSUV4dGVuZGVkUHJvY2Vzc0NvbnRleHQsIF9wYXJhbXM6IHN0cmluZ1tdLCBfaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIC8vIOS4jemcgOimgeeJueauiuWkhOeQhlxuICB9XG59XG4iXX0=