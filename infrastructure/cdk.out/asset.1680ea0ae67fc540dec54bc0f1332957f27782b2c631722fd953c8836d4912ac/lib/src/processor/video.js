"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoProcessor = void 0;
const child_process = require("child_process");
const _1 = require(".");
const is = require("../is");
const _base_1 = require("./image/_base");
class VideoProcessor {
    constructor() {
        this.name = 'video';
    }
    static getInstance() {
        if (!VideoProcessor._instance) {
            VideoProcessor._instance = new VideoProcessor();
        }
        return VideoProcessor._instance;
    }
    async newContext(uri, actions, bufferStore) {
        return Promise.resolve({
            uri,
            actions,
            mask: new _base_1.ActionMask(actions),
            bufferStore,
            features: {},
            headers: {},
        });
    }
    validate(params) {
        let opt = {
            t: 1,
            f: 'jpg',
            m: 'fast',
            o: 'image/jpeg',
        };
        for (const param of params) {
            if (('snapshot' === param) || (!param)) {
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
                        throw new _1.InvalidArgument(`Unkown video snapshot format param: "${v}", must be jpg/png`);
                    }
                }
            }
            else if (k === 'm') {
                if (v) {
                    if (v !== 'fast') {
                        throw new _1.InvalidArgument(`Unkown video snapshot model param: "${v}", must be fast`);
                    }
                }
            }
            else {
                throw new _1.InvalidArgument(`Unkown param: "${k}"`);
            }
        }
        return opt;
    }
    // e.g. https://Host/ObjectName?x-oss-process=style/<StyleName>
    async process(ctx) {
        if (!ctx.actions) {
            throw new _1.InvalidArgument('Invalid video context! No "actions" field.');
        }
        if (ctx.actions.length !== 2) {
            throw new _1.InvalidArgument('Invalid video request!');
        }
        const action = ctx.actions[1];
        if (is.string(action)) {
            const params = action.split(',');
            const actionName = params[0];
            if (actionName !== 'snapshot') {
                throw new _1.InvalidArgument('Invalid video action name!');
            }
            if (params.length !== 4) {
                throw new _1.InvalidArgument('Invalid video request! Params .e.g ?x-oss-process=video/snapshot,t_1,f_jpg,m_fast');
            }
            const opt = this.validate(params);
            const url = await ctx.bufferStore.url(ctx.uri);
            const data = await _videoScreenShot('ffmpeg', ['-i', url, '-ss', opt.t.toString(), '-vframes', '1', '-c:v', opt.f, '-f', 'image2pipe', '-']);
            return { data: data, type: opt.o };
        }
        else {
            return { data: '{}', type: 'application/json' };
        }
    }
    register(..._) { }
}
exports.VideoProcessor = VideoProcessor;
const MB = 1024 * 1024;
const MAX_BUFFER = 5 * MB;
// https://sourcegraph.com/github.com/nodejs/node@f7668fa2aa2781dc57d5423a0cfcfa933539779e/-/blob/lib/child_process.js?L279:10
// TODO: Return stderr when raise exception.
function _videoScreenShot(cmd, args) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvY2Vzc29yL3ZpZGVvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLCtDQUErQztBQUMvQyx3QkFBbUg7QUFDbkgsNEJBQTRCO0FBRTVCLHlDQUEyQztBQVMzQyxNQUFhLGNBQWM7SUFXekI7UUFGZ0IsU0FBSSxHQUFXLE9BQU8sQ0FBQztJQUVmLENBQUM7SUFWbEIsTUFBTSxDQUFDLFdBQVc7UUFDdkIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUU7WUFDN0IsY0FBYyxDQUFDLFNBQVMsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1NBQ2pEO1FBQ0QsT0FBTyxjQUFjLENBQUMsU0FBUyxDQUFDO0lBQ2xDLENBQUM7SUFPTSxLQUFLLENBQUMsVUFBVSxDQUFDLEdBQVcsRUFBRSxPQUFpQixFQUFFLFdBQXlCO1FBQy9FLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUNyQixHQUFHO1lBQ0gsT0FBTztZQUNQLElBQUksRUFBRSxJQUFJLGtCQUFVLENBQUMsT0FBTyxDQUFDO1lBQzdCLFdBQVc7WUFDWCxRQUFRLEVBQUUsRUFBRTtZQUNaLE9BQU8sRUFBRSxFQUFFO1NBQ1osQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVNLFFBQVEsQ0FBQyxNQUFnQjtRQUM5QixJQUFJLEdBQUcsR0FBYztZQUNuQixDQUFDLEVBQUUsQ0FBQztZQUNKLENBQUMsRUFBRSxLQUFLO1lBQ1IsQ0FBQyxFQUFFLE1BQU07WUFDVCxDQUFDLEVBQUUsWUFBWTtTQUNoQixDQUFDO1FBRUYsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUU7WUFDMUIsSUFBSSxDQUFDLFVBQVUsS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3RDLFNBQVM7YUFDVjtZQUNELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFD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RUFBRSxJQUFJLENBQUMsQ0FBQzthQUN6QjtRQUNILENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDaEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsYUFBYSxDQUFDLEtBQUs7Z0JBQ2xELFNBQVMsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDO2dCQUMxQixJQUFJLFNBQVMsR0FBRyxVQUFVLEVBQUU7b0JBQzFCLEVBQUUsR0FBRyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUN6QyxJQUFJLEVBQUUsQ0FBQztpQkFDUjtxQkFBTTtvQkFDTCxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUNyQjtZQUNILENBQUMsQ0FBQyxDQUFDO1NBQ0o7YUFBTTtZQUNMLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7WUFDMUMsT0FBTztTQUNSO1FBRUQsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDL0IsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IElBY3Rpb24sIEludmFsaWRBcmd1bWVudCwgSVByb2Nlc3NDb250ZXh0LCBJUHJvY2Vzc29yLCBJUHJvY2Vzc1Jlc3BvbnNlLCBJQWN0aW9uT3B0cywgUmVhZE9ubHkgfSBmcm9tICcuJztcbmltcG9ydCAqIGFzIGlzIGZyb20gJy4uL2lzJztcbmltcG9ydCB7IElCdWZmZXJTdG9yZSB9IGZyb20gJy4uL3N0b3JlJztcbmltcG9ydCB7IEFjdGlvbk1hc2sgfSBmcm9tICcuL2ltYWdlL19iYXNlJztcblxuZXhwb3J0IGludGVyZmFjZSBWaWRlb09wdHMgZXh0ZW5kcyBJQWN0aW9uT3B0cyB7XG4gIHQ6IG51bWJlcjsgLy8g5oyH5a6a5oiq5Zu+5pe26Ze0LCDljZXkvY3vvJpzXG4gIGY6IHN0cmluZzsgLy8g5oyH5a6a6L6T5Ye65Zu+54mH55qE5qC85byPLCBqcGflkoxwbmdcbiAgbTogc3RyaW5nOyAvLyDmjIflrprmiKrlm77mqKHlvI/vvIzkuI3mjIflrprliJnkuLrpu5jorqTmqKHlvI/vvIzmoLnmja7ml7bpl7Tnsr7noa7miKrlm77jgILlpoLmnpzmjIflrprkuLpmYXN077yM5YiZ5oiq5Y+W6K+l5pe26Ze054K55LmL5YmN55qE5pyA6L+R55qE5LiA5Liq5YWz6ZSu5bin44CCXG4gIG86IHN0cmluZzsgLy8g6L6T5Ye65qC85byPXG59XG5cbmV4cG9ydCBjbGFzcyBWaWRlb1Byb2Nlc3NvciBpbXBsZW1lbnRzIElQcm9jZXNzb3Ige1xuICBwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IFZpZGVvUHJvY2Vzc29yIHtcbiAgICBpZiAoIVZpZGVvUHJvY2Vzc29yLl9pbnN0YW5jZSkge1xuICAgICAgVmlkZW9Qcm9jZXNzb3IuX2luc3RhbmNlID0gbmV3IFZpZGVvUHJvY2Vzc29yKCk7XG4gICAgfVxuICAgIHJldHVybiBWaWRlb1Byb2Nlc3Nvci5faW5zdGFuY2U7XG4gIH1cbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3RhbmNlOiBWaWRlb1Byb2Nlc3NvcjtcblxuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ3ZpZGVvJztcblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkgeyB9XG5cbiAgcHVibGljIGFzeW5jIG5ld0NvbnRleHQodXJpOiBzdHJpbmcsIGFjdGlvbnM6IHN0cmluZ1tdLCBidWZmZXJTdG9yZTogSUJ1ZmZlclN0b3JlKTogUHJvbWlzZTxJUHJvY2Vzc0NvbnRleHQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHVyaSxcbiAgICAgIGFjdGlvbnMsXG4gICAgICBtYXNrOiBuZXcgQWN0aW9uTWFzayhhY3Rpb25zKSxcbiAgICAgIGJ1ZmZlclN0b3JlLFxuICAgICAgZmVhdHVyZXM6IHt9LFxuICAgICAgaGVhZGVyczoge30sXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PFZpZGVvT3B0cz4ge1xuICAgIGxldCBvcHQ6IFZpZGVvT3B0cyA9IHtcbiAgICAgIHQ6IDEsXG4gICAgICBmOiAnanBnJyxcbiAgICAgIG06ICdmYXN0JyxcbiAgICAgIG86ICdpbWFnZS9qcGVnJyxcbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBwYXJhbSBvZiBwYXJhbXMpIHtcbiAgICAgIGlmICgoJ3NuYXBzaG90JyA9PT0gcGFyYW0pIHx8ICghcGFyYW0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgW2ssIHZdID0gcGFyYW0uc3BsaXQoJ18nKTtcbiAgICAgIGlmIChrID09PSAndCcpIHtcbiAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICBvcHQudCA9IE51bWJlcih2KSAvIDEwMDA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoayA9PT0gJ2YnKSB7XG4gICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgaWYgKHYgPT09ICdqcGcnKSB7XG4gICAgICAgICAgICBvcHQuZiA9ICdtanBlZyc7XG4gICAgICAgICAgICBvcHQubyA9ICdpbWFnZS9qcGVnJztcbiAgICAgICAgICB9IGVsc2UgaWYgKHYgPT09ICdwbmcnKSB7XG4gICAgICAgICAgICBvcHQuZiA9IHY7XG4gICAgICAgICAgICBvcHQubyA9ICdpbWFnZS9wbmcnO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gdmlkZW8gc25hcHNob3QgZm9ybWF0IHBhcmFtOiBcIiR7dn1cIiwgbXVzdCBiZSBqcGcvcG5nYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdtJykge1xuICAgICAgICBpZiAodikge1xuICAgICAgICAgIGlmICh2ICE9PSAnZmFzdCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYFVua293biB2aWRlbyBzbmFwc2hvdCBtb2RlbCBwYXJhbTogXCIke3Z9XCIsIG11c3QgYmUgZmFzdGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgVW5rb3duIHBhcmFtOiBcIiR7a31cImApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3B0O1xuICB9XG5cblxuICAvLyBlLmcuIGh0dHBzOi8vSG9zdC9PYmplY3ROYW1lP3gtb3NzLXByb2Nlc3M9c3R5bGUvPFN0eWxlTmFtZT5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJUHJvY2Vzc0NvbnRleHQpOiBQcm9taXNlPElQcm9jZXNzUmVzcG9uc2U+IHtcbiAgICBpZiAoIWN0eC5hY3Rpb25zKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdJbnZhbGlkIHZpZGVvIGNvbnRleHQhIE5vIFwiYWN0aW9uc1wiIGZpZWxkLicpO1xuICAgIH1cblxuICAgIGlmIChjdHguYWN0aW9ucy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0ludmFsaWQgdmlkZW8gcmVxdWVzdCEnKTtcbiAgICB9XG4gICAgY29uc3QgYWN0aW9uID0gY3R4LmFjdGlvbnNbMV07XG4gICAgaWYgKGlzLnN0cmluZyhhY3Rpb24pKSB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBhY3Rpb24uc3BsaXQoJywnKTtcbiAgICAgIGNvbnN0IGFjdGlvbk5hbWUgPSBwYXJhbXNbMF07XG4gICAgICBpZiAoYWN0aW9uTmFtZSAhPT0gJ3NuYXBzaG90Jykge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdJbnZhbGlkIHZpZGVvIGFjdGlvbiBuYW1lIScpO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFyYW1zLmxlbmd0aCAhPT0gNCkge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdJbnZhbGlkIHZpZGVvIHJlcXVlc3QhIFBhcmFtcyAuZS5nID94LW9zcy1wcm9jZXNzPXZpZGVvL3NuYXBzaG90LHRfMSxmX2pwZyxtX2Zhc3QnKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9wdCA9IHRoaXMudmFsaWRhdGUocGFyYW1zKTtcbiAgICAgIGNvbnN0IHVybCA9IGF3YWl0IGN0eC5idWZmZXJTdG9yZS51cmwoY3R4LnVyaSk7XG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgX3ZpZGVvU2NyZWVuU2hvdCgnZmZtcGVnJywgWyctaScsIHVybCwgJy1zcycsIG9wdC50LnRvU3RyaW5nKCksICctdmZyYW1lcycsICcxJywgJy1jOnYnLCBvcHQuZiwgJy1mJywgJ2ltYWdlMnBpcGUnLCAnLSddKTtcbiAgICAgIHJldHVybiB7IGRhdGE6IGRhdGEsIHR5cGU6IG9wdC5vIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IGRhdGE6ICd7fScsIHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyByZWdpc3RlciguLi5fOiBJQWN0aW9uW10pOiB2b2lkIHsgfVxufVxuXG5jb25zdCBNQiA9IDEwMjQgKiAxMDI0O1xuY29uc3QgTUFYX0JVRkZFUiA9IDUgKiBNQjtcblxuLy8gaHR0cHM6Ly9zb3VyY2VncmFwaC5jb20vZ2l0aHViLmNvbS9ub2RlanMvbm9kZUBmNzY2OGZhMmFhMjc4MWRjNTdkNTQyM2EwY2ZjZmE5MzM1Mzk3NzllLy0vYmxvYi9saWIvY2hpbGRfcHJvY2Vzcy5qcz9MMjc5OjEwXG4vLyBUT0RPOiBSZXR1cm4gc3RkZXJyIHdoZW4gcmFpc2UgZXhjZXB0aW9uLlxuZnVuY3Rpb24gX3ZpZGVvU2NyZWVuU2hvdChjbWQ6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10pIHtcbiAgY29uc3QgY2hpbGQgPSBjaGlsZF9wcm9jZXNzLnNwYXduKGNtZCwgYXJncyk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IF9zdGRvdXQ6IGFueVtdID0gW107XG4gICAgbGV0IHN0ZG91dExlbiA9IDA7XG5cbiAgICBsZXQga2lsbGVkID0gZmFsc2U7XG4gICAgbGV0IGV4aXRlZCA9IGZhbHNlO1xuICAgIGxldCBleDogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIGV4aXRoYW5kbGVyKGNvZGU6IG51bWJlciB8IG51bGwsIHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsKSB7XG4gICAgICBpZiAoZXhpdGVkKSB7IHJldHVybjsgfVxuICAgICAgZXhpdGVkID0gdHJ1ZTtcblxuICAgICAgLy8gbWVyZ2UgY2h1bmtzXG4gICAgICBjb25zdCBzdGRvdXQgPSBCdWZmZXIuY29uY2F0KF9zdGRvdXQpO1xuXG4gICAgICBpZiAoIWV4ICYmIGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgIHJlc29sdmUoc3Rkb3V0KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBfY21kID0gY21kICsgYXJncy5qb2luKCcgJyk7XG5cbiAgICAgIGlmICghZXgpIHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG4gICAgICAgIGV4ID0gbmV3IEVycm9yKCdDb21tYW5kIGZhaWxlZDogJyArIF9jbWQgKyAnXFxuJyk7XG4gICAgICAgIChleCBhcyBhbnkpLmtpbGxlZCA9IGNoaWxkLmtpbGxlZCB8fCBraWxsZWQ7XG4gICAgICAgIChleCBhcyBhbnkpLmNvZGUgPSBjb2RlO1xuICAgICAgICAoZXggYXMgYW55KS5zaWduYWwgPSBzaWduYWw7XG4gICAgICB9XG4gICAgICAoZXggYXMgYW55KS5jbWQgPSBfY21kO1xuICAgICAgcmVqZWN0KGV4KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcmhhbmRsZXIoZTogRXJyb3IpIHtcbiAgICAgIGV4ID0gZTtcbiAgICAgIGlmIChjaGlsZC5zdGRvdXQpIHtcbiAgICAgICAgY2hpbGQuc3Rkb3V0LmRlc3Ryb3koKTtcbiAgICAgIH1cbiAgICAgIGlmIChjaGlsZC5zdGRlcnIpIHtcbiAgICAgICAgY2hpbGQuc3RkZXJyLmRlc3Ryb3koKTtcbiAgICAgIH1cbiAgICAgIGV4aXRoYW5kbGVyKG51bGwsIG51bGwpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGtpbGwoKSB7XG4gICAgICBpZiAoY2hpbGQuc3Rkb3V0KSB7XG4gICAgICAgIGNoaWxkLnN0ZG91dC5kZXN0cm95KCk7XG4gICAgICB9XG4gICAgICBpZiAoY2hpbGQuc3RkZXJyKSB7XG4gICAgICAgIGNoaWxkLnN0ZGVyci5kZXN0cm95KCk7XG4gICAgICB9XG5cbiAgICAgIGtpbGxlZCA9IHRydWU7XG4gICAgICB0cnkge1xuICAgICAgICBjaGlsZC5raWxsKCdTSUdURVJNJyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGV4ID0gZSBhcyBFcnJvcjtcbiAgICAgICAgZXhpdGhhbmRsZXIobnVsbCwgbnVsbCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNoaWxkLnN0ZG91dCkge1xuICAgICAgY2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgZnVuY3Rpb24gb25DaGlsZFN0ZG91dChjaHVuaykge1xuICAgICAgICBzdGRvdXRMZW4gKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgICBpZiAoc3Rkb3V0TGVuID4gTUFYX0JVRkZFUikge1xuICAgICAgICAgIGV4ID0gbmV3IEVycm9yKCdFeGNlZWQgbWF4IGJ1ZmZlciBzaXplJyk7XG4gICAgICAgICAga2lsbCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIF9zdGRvdXQucHVzaChjaHVuayk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdDYW5cXCd0IGNyZWF0ZSBzdGRvdXQnKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2hpbGQub24oJ2Nsb3NlJywgZXhpdGhhbmRsZXIpO1xuICAgIGNoaWxkLm9uKCdlcnJvcicsIGVycm9yaGFuZGxlcik7XG4gIH0pO1xufVxuIl19