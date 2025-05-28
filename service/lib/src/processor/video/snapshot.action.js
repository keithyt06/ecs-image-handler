"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnapshotAction = void 0;
const child_process = require("child_process");
const __1 = require("..");
class SnapshotAction {
    constructor() {
        this.name = 'snapshot';
    }
    validate(params) {
        let opt = {
            t: 1,
            f: 'jpg',
            m: 'fast',
            o: 'image/jpeg',
        };
        for (const param of params) {
            if ((this.name === param) || (!param)) {
                continue;
            }
            const [k, v] = param.split('_');
            if (k === 't') {
                if (v) {
                    opt.t = Number(v) / 1000;
                }
            }
            else if (k === 'f') {
                if (v) {
                    if (v === 'jpg') {
                        opt.f = 'mjpeg';
                        opt.o = 'image/jpeg';
                    }
                    else if (v === 'png') {
                        opt.f = v;
                        opt.o = 'image/png';
                    }
                    else {
                        throw new __1.InvalidArgument(`Unkown video snapshot format param: "${v}", must be jpg/png`);
                    }
                }
            }
            else if (k === 'm') {
                if (v) {
                    if (v !== 'fast') {
                        throw new __1.InvalidArgument(`Unkown video snapshot model param: "${v}", must be fast`);
                    }
                }
            }
            else {
                throw new __1.InvalidArgument(`Unkown param: "${k}"`);
            }
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        const url = await ctx.bufferStore.url(ctx.uri);
        const data = await this.videoScreenShot('ffmpeg', [
            '-i', url,
            '-ss', opt.t.toString(),
            '-vframes', '1',
            '-c:v', opt.f,
            '-f', 'image2pipe',
            '-'
        ]);
        // 添加到上下文中
        ctx.result = {
            data: data,
            type: opt.o
        };
    }
    beforeNewContext(_ctx, _params, _index) {
        // 不需要特殊处理
    }
    beforeProcess(_ctx, _params, _index) {
        // 不需要特殊处理
    }
    videoScreenShot(cmd, args) {
        const MB = 1024 * 1024;
        const MAX_BUFFER = 5 * MB;
        const child = child_process.spawn(cmd, args);
        return new Promise((resolve, reject) => {
            const _stdout = [];
            let stdoutLen = 0;
            let killed = false;
            let exited = false;
            let ex = null;
            function exithandler(code, signal) {
                if (exited) {
                    return;
                }
                exited = true;
                // merge chunks
                const stdout = Buffer.concat(_stdout);
                if (!ex && code === 0 && signal === null) {
                    resolve(stdout);
                    return;
                }
                const _cmd = cmd + args.join(' ');
                if (!ex) {
                    // eslint-disable-next-line no-restricted-syntax
                    ex = new Error('Command failed: ' + _cmd + '\n');
                    ex.killed = child.killed || killed;
                    ex.code = code;
                    ex.signal = signal;
                }
                ex.cmd = _cmd;
                reject(ex);
            }
            function errorhandler(e) {
                ex = e;
                if (child.stdout) {
                    child.stdout.destroy();
                }
                if (child.stderr) {
                    child.stderr.destroy();
                }
                exithandler(null, null);
            }
            function kill() {
                if (child.stdout) {
                    child.stdout.destroy();
                }
                if (child.stderr) {
                    child.stderr.destroy();
                }
                killed = true;
                try {
                    child.kill('SIGTERM');
                }
                catch (e) {
                    ex = e;
                    exithandler(null, null);
                }
            }
            if (child.stdout) {
                child.stdout.on('data', function onChildStdout(chunk) {
                    stdoutLen += chunk.length;
                    if (stdoutLen > MAX_BUFFER) {
                        ex = new Error('Exceed max buffer size');
                        kill();
                    }
                    else {
                        _stdout.push(chunk);
                    }
                });
            }
            else {
                reject(new Error('Can\'t create stdout'));
                return;
            }
            child.on('close', exithandler);
            child.on('error', errorhandler);
        });
    }
}
exports.SnapshotAction = SnapshotAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25hcHNob3QuYWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci92aWRlby9zbmFwc2hvdC5hY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQStDO0FBQy9DLDBCQUFxRTtBQVVyRSxNQUFhLGNBQWM7SUFBM0I7UUFDa0IsU0FBSSxHQUFXLFVBQVUsQ0FBQztJQTZKNUMsQ0FBQztJQTNKUSxRQUFRLENBQUMsTUFBZ0I7UUFDOUIsSUFBSSxHQUFHLEdBQXNCO1lBQzNCLENBQUMsRUFBRSxDQUFDO1lBQ0osQ0FBQyxFQUFFLEtBQUs7WUFDUixDQUFDLEVBQUUsTUFBTTtZQUNULENBQUMsRUFBRSxZQUFZO1NBQ2hCLENBQUM7UUFFRixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtZQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3JDLFNBQVM7YUFDVjtZQUNELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUU7Z0JBQ2IsSUFBSSxDQUFDLEVBQUU7b0JBQ0wsR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO2lCQUMxQjthQUNGO2lCQUFNLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRTtnQkFDcEIsSUFBSSxDQUFDLEVBQUU7b0JBQ0wsSUFBSSxDQUFDLEtBQUssS0FBSyxFQUFFO3dCQUNmLEdBQUcsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDO3dCQUNoQixHQUFHLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQztxQkFDdEI7eUJBQU0sSUFBSSxDQUFDLEtBQUssS0FBSyxFQUFFO3dCQUN0QixH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LElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDekI7WUFDSCxDQUFDO1lBRUQsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFO2dCQUNoQixLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxhQUFhLENBQUMsS0FBSztvQkFDbEQsU0FBUyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUM7b0JBQzFCLElBQUksU0FBUyxHQUFHLFVBQVUsRUFBRTt3QkFDMUIsRUFBRSxHQUFHLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7d0JBQ3pDLElBQUksRUFBRSxDQUFDO3FCQUNSO3lCQUFNO3dCQUNMLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7cUJBQ3JCO2dCQUNILENBQUMsQ0FBQyxDQUFDO2FBQ0o7aUJBQU07Z0JBQ0wsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDMUMsT0FBTzthQUNSO1lBRUQsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDL0IsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5SkQsd0NBOEpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IElBY3Rpb24sIEludmFsaWRBcmd1bWVudCwgSUFjdGlvbk9wdHMsIFJlYWRPbmx5IH0gZnJvbSAnLi4nO1xuaW1wb3J0IHsgSUV4dGVuZGVkUHJvY2Vzc0NvbnRleHQgfSBmcm9tICcuL2NvbnRleHQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvU25hcHNob3RPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICB0OiBudW1iZXI7IC8vIOaMh+WumuaIquWbvuaXtumXtCwg5Y2V5L2N77yac1xuICBmOiBzdHJpbmc7IC8vIOaMh+Wumui+k+WHuuWbvueJh+eahOagvOW8jywganBn5ZKMcG5nXG4gIG06IHN0cmluZzsgLy8g5oyH5a6a5oiq5Zu+5qih5byP77yM5LiN5oyH5a6a5YiZ5Li66buY6K6k5qih5byP77yM5qC55o2u5pe26Ze057K+56Gu5oiq5Zu+44CC5aaC5p6c5oyH5a6a5Li6ZmFzdO+8jOWImeaIquWPluivpeaXtumXtOeCueS5i+WJjeeahOacgOi/keeahOS4gOS4quWFs+mUruW4p+OAglxuICBvOiBzdHJpbmc7IC8vIOi+k+WHuuagvOW8j1xufVxuXG5leHBvcnQgY2xhc3MgU25hcHNob3RBY3Rpb24gaW1wbGVtZW50cyBJQWN0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyA9ICdzbmFwc2hvdCc7XG5cbiAgcHVibGljIHZhbGlkYXRlKHBhcmFtczogc3RyaW5nW10pOiBSZWFkT25seTxWaWRlb1NuYXBzaG90T3B0cz4ge1xuICAgIGxldCBvcHQ6IFZpZGVvU25hcHNob3RPcHRzID0ge1xuICAgICAgdDogMSxcbiAgICAgIGY6ICdqcGcnLFxuICAgICAgbTogJ2Zhc3QnLFxuICAgICAgbzogJ2ltYWdlL2pwZWcnLFxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IHBhcmFtIG9mIHBhcmFtcykge1xuICAgICAgaWYgKCh0aGlzLm5hbWUgPT09IHBhcmFtKSB8fCAoIXBhcmFtKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtrLCB2XSA9IHBhcmFtLnNwbGl0KCdfJyk7XG4gICAgICBpZiAoayA9PT0gJ3QnKSB7XG4gICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgb3B0LnQgPSBOdW1iZXIodikgLyAxMDAwO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdmJykge1xuICAgICAgICBpZiAodikge1xuICAgICAgICAgIGlmICh2ID09PSAnanBnJykge1xuICAgICAgICAgICAgb3B0LmYgPSAnbWpwZWcnO1xuICAgICAgICAgICAgb3B0Lm8gPSAnaW1hZ2UvanBlZyc7XG4gICAgICAgICAgfSBlbHNlIGlmICh2ID09PSAncG5nJykge1xuICAgICAgICAgICAgb3B0LmYgPSB2O1xuICAgICAgICAgICAgb3B0Lm8gPSAnaW1hZ2UvcG5nJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgVW5rb3duIHZpZGVvIHNuYXBzaG90IGZvcm1hdCBwYXJhbTogXCIke3Z9XCIsIG11c3QgYmUganBnL3BuZ2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChrID09PSAnbScpIHtcbiAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICBpZiAodiAhPT0gJ2Zhc3QnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gdmlkZW8gc25hcHNob3QgbW9kZWwgcGFyYW06IFwiJHt2fVwiLCBtdXN0IGJlIGZhc3RgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYFVua293biBwYXJhbTogXCIke2t9XCJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzKGN0eDogSUV4dGVuZGVkUHJvY2Vzc0NvbnRleHQsIHBhcmFtczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBvcHQgPSB0aGlzLnZhbGlkYXRlKHBhcmFtcyk7XG4gICAgY29uc3QgdXJsID0gYXdhaXQgY3R4LmJ1ZmZlclN0b3JlLnVybChjdHgudXJpKTtcbiAgICBcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgdGhpcy52aWRlb1NjcmVlblNob3QoJ2ZmbXBlZycsIFtcbiAgICAgICctaScsIHVybCwgXG4gICAgICAnLXNzJywgb3B0LnQudG9TdHJpbmcoKSwgXG4gICAgICAnLXZmcmFtZXMnLCAnMScsIFxuICAgICAgJy1jOnYnLCBvcHQuZiwgXG4gICAgICAnLWYnLCAnaW1hZ2UycGlwZScsIFxuICAgICAgJy0nXG4gICAgXSk7XG4gICAgXG4gICAgLy8g5re75Yqg5Yiw5LiK5LiL5paH5LitXG4gICAgY3R4LnJlc3VsdCA9IHtcbiAgICAgIGRhdGE6IGRhdGEsXG4gICAgICB0eXBlOiBvcHQub1xuICAgIH07XG4gIH1cblxuICBwdWJsaWMgYmVmb3JlTmV3Q29udGV4dChfY3R4OiBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCwgX3BhcmFtczogc3RyaW5nW10sIF9pbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgLy8g5LiN6ZyA6KaB54m55q6K5aSE55CGXG4gIH1cblxuICBwdWJsaWMgYmVmb3JlUHJvY2VzcyhfY3R4OiBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCwgX3BhcmFtczogc3RyaW5nW10sIF9pbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgLy8g5LiN6ZyA6KaB54m55q6K5aSE55CGXG4gIH1cbiAgXG4gIHByaXZhdGUgdmlkZW9TY3JlZW5TaG90KGNtZDogc3RyaW5nLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8QnVmZmVyPiB7XG4gICAgY29uc3QgTUIgPSAxMDI0ICogMTAyNDtcbiAgICBjb25zdCBNQVhfQlVGRkVSID0gNSAqIE1CO1xuICAgIGNvbnN0IGNoaWxkID0gY2hpbGRfcHJvY2Vzcy5zcGF3bihjbWQsIGFyZ3MpO1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgX3N0ZG91dDogYW55W10gPSBbXTtcbiAgICAgIGxldCBzdGRvdXRMZW4gPSAwO1xuXG4gICAgICBsZXQga2lsbGVkID0gZmFsc2U7XG4gICAgICBsZXQgZXhpdGVkID0gZmFsc2U7XG4gICAgICBsZXQgZXg6IEVycm9yIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgIGZ1bmN0aW9uIGV4aXRoYW5kbGVyKGNvZGU6IG51bWJlciB8IG51bGwsIHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsKSB7XG4gICAgICAgIGlmIChleGl0ZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgIGV4aXRlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gbWVyZ2UgY2h1bmtzXG4gICAgICAgIGNvbnN0IHN0ZG91dCA9IEJ1ZmZlci5jb25jYXQoX3N0ZG91dCk7XG5cbiAgICAgICAgaWYgKCFleCAmJiBjb2RlID09PSAwICYmIHNpZ25hbCA9PT0gbnVsbCkge1xuICAgICAgICAgIHJlc29sdmUoc3Rkb3V0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBfY21kID0gY21kICsgYXJncy5qb2luKCcgJyk7XG5cbiAgICAgICAgaWYgKCFleCkge1xuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuICAgICAgICAgIGV4ID0gbmV3IEVycm9yKCdDb21tYW5kIGZhaWxlZDogJyArIF9jbWQgKyAnXFxuJyk7XG4gICAgICAgICAgKGV4IGFzIGFueSkua2lsbGVkID0gY2hpbGQua2lsbGVkIHx8IGtpbGxlZDtcbiAgICAgICAgICAoZXggYXMgYW55KS5jb2RlID0gY29kZTtcbiAgICAgICAgICAoZXggYXMgYW55KS5zaWduYWwgPSBzaWduYWw7XG4gICAgICAgIH1cbiAgICAgICAgKGV4IGFzIGFueSkuY21kID0gX2NtZDtcbiAgICAgICAgcmVqZWN0KGV4KTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZXJyb3JoYW5kbGVyKGU6IEVycm9yKSB7XG4gICAgICAgIGV4ID0gZTtcbiAgICAgICAgaWYgKGNoaWxkLnN0ZG91dCkge1xuICAgICAgICAgIGNoaWxkLnN0ZG91dC5kZXN0cm95KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNoaWxkLnN0ZGVycikge1xuICAgICAgICAgIGNoaWxkLnN0ZGVyci5kZXN0cm95KCk7XG4gICAgICAgIH1cbiAgICAgICAgZXhpdGhhbmRsZXIobnVsbCwgbnVsbCk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGtpbGwoKSB7XG4gICAgICAgIGlmIChjaGlsZC5zdGRvdXQpIHtcbiAgICAgICAgICBjaGlsZC5zdGRvdXQuZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaGlsZC5zdGRlcnIpIHtcbiAgICAgICAgICBjaGlsZC5zdGRlcnIuZGVzdHJveSgpO1xuICAgICAgICB9XG5cbiAgICAgICAga2lsbGVkID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjaGlsZC5raWxsKCdTSUdURVJNJyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBleCA9IGUgYXMgRXJyb3I7XG4gICAgICAgICAgZXhpdGhhbmRsZXIobnVsbCwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGNoaWxkLnN0ZG91dCkge1xuICAgICAgICBjaGlsZC5zdGRvdXQub24oJ2RhdGEnLCBmdW5jdGlvbiBvbkNoaWxkU3Rkb3V0KGNodW5rKSB7XG4gICAgICAgICAgc3Rkb3V0TGVuICs9IGNodW5rLmxlbmd0aDtcbiAgICAgICAgICBpZiAoc3Rkb3V0TGVuID4gTUFYX0JVRkZFUikge1xuICAgICAgICAgICAgZXggPSBuZXcgRXJyb3IoJ0V4Y2VlZCBtYXggYnVmZmVyIHNpemUnKTtcbiAgICAgICAgICAgIGtpbGwoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgX3N0ZG91dC5wdXNoKGNodW5rKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignQ2FuXFwndCBjcmVhdGUgc3Rkb3V0JykpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNoaWxkLm9uKCdjbG9zZScsIGV4aXRoYW5kbGVyKTtcbiAgICAgIGNoaWxkLm9uKCdlcnJvcicsIGVycm9yaGFuZGxlcik7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==