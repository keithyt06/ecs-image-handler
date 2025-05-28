"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.identify = exports.convert = void 0;
const child_process = require("child_process");
const stream_1 = require("stream");
// TODO: ImageMagick is slower than sharp for about 3x. Try removing ImageMagick later.
const MAX_BUFFER = 1024 * 1024;
// https://sourcegraph.com/github.com/nodejs/node@f7668fa2aa2781dc57d5423a0cfcfa933539779e/-/blob/lib/child_process.js?L279:10
function _imagemagick(cmd, buffer, args) {
    const child = child_process.spawn(cmd, args);
    stream_1.Readable.from(buffer).pipe(child.stdin);
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
function convert(buffer, args) {
    return _imagemagick('convert', buffer, ['-', ...args, '-']);
}
exports.convert = convert;
function identify(buffer, args) {
    return _imagemagick('identify', buffer, [...args, '-']);
}
exports.identify = identify;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VtYWdpY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW1hZ2VtYWdpY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQStDO0FBQy9DLG1DQUFrQztBQUVsQyx1RkFBdUY7QUFFdkYsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUUvQiw4SEFBOEg7QUFDOUgsU0FBUyxZQUFZLENBQUMsR0FBVyxFQUFFLE1BQWMsRUFBRSxJQUF1QjtJQUN4RSxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUU3QyxpQkFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRXhDLE9BQU8sSUFBSSxPQUFPLENBQVMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDN0MsTUFBTSxPQUFPLEdBQVUsRUFBRSxDQUFDO1FBQzFCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztRQUVsQixJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksRUFBRSxHQUFpQixJQUFJLENBQUM7UUFFNUIsU0FBUyxXQUFXLENBQUMsSUFBbUIsRUFBRSxNQUE2QjtZQUNyRSxJQUFJLE1BQU0sRUFBRTtnQkFBRSxPQUFPO2FBQUU7WUFDdkIsTUFBTSxHQUFHLElBQUksQ0FBQztZQUVkLGVBQWU7WUFDZixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRXRDLElBQUksQ0FBQyxFQUFFLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO2dCQUN4QyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2hCLE9BQU87YUFDUjtZQUVELE1B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QUZELDRCQUVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSAnc3RyZWFtJztcblxuLy8gVE9ETzogSW1hZ2VNYWdpY2sgaXMgc2xvd2VyIHRoYW4gc2hhcnAgZm9yIGFib3V0IDN4LiBUcnkgcmVtb3ZpbmcgSW1hZ2VNYWdpY2sgbGF0ZXIuXG5cbmNvbnN0IE1BWF9CVUZGRVIgPSAxMDI0ICogMTAyNDtcblxuLy8gaHR0cHM6Ly9zb3VyY2VncmFwaC5jb20vZ2l0aHViLmNvbS9ub2RlanMvbm9kZUBmNzY2OGZhMmFhMjc4MWRjNTdkNTQyM2EwY2ZjZmE5MzM1Mzk3NzllLy0vYmxvYi9saWIvY2hpbGRfcHJvY2Vzcy5qcz9MMjc5OjEwXG5mdW5jdGlvbiBfaW1hZ2VtYWdpY2soY21kOiBzdHJpbmcsIGJ1ZmZlcjogQnVmZmVyLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSkge1xuICBjb25zdCBjaGlsZCA9IGNoaWxkX3Byb2Nlc3Muc3Bhd24oY21kLCBhcmdzKTtcblxuICBSZWFkYWJsZS5mcm9tKGJ1ZmZlcikucGlwZShjaGlsZC5zdGRpbik7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IF9zdGRvdXQ6IGFueVtdID0gW107XG4gICAgbGV0IHN0ZG91dExlbiA9IDA7XG5cbiAgICBsZXQga2lsbGVkID0gZmFsc2U7XG4gICAgbGV0IGV4aXRlZCA9IGZhbHNlO1xuICAgIGxldCBleDogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIGV4aXRoYW5kbGVyKGNvZGU6IG51bWJlciB8IG51bGwsIHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsKSB7XG4gICAgICBpZiAoZXhpdGVkKSB7IHJldHVybjsgfVxuICAgICAgZXhpdGVkID0gdHJ1ZTtcblxuICAgICAgLy8gbWVyZ2UgY2h1bmtzXG4gICAgICBjb25zdCBzdGRvdXQgPSBCdWZmZXIuY29uY2F0KF9zdGRvdXQpO1xuXG4gICAgICBpZiAoIWV4ICYmIGNvZGUgPT09IDAgJiYgc2lnbmFsID09PSBudWxsKSB7XG4gICAgICAgIHJlc29sdmUoc3Rkb3V0KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBfY21kID0gY21kICsgYXJncy5qb2luKCcgJyk7XG4gICAgICBpZiAoIWV4KSB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuICAgICAgICBleCA9IG5ldyBFcnJvcignQ29tbWFuZCBmYWlsZWQ6ICcgKyBfY21kICsgJ1xcbicpO1xuICAgICAgICAoZXggYXMgYW55KS5raWxsZWQgPSBjaGlsZC5raWxsZWQgfHwga2lsbGVkO1xuICAgICAgICAoZXggYXMgYW55KS5jb2RlID0gY29kZTtcbiAgICAgICAgKGV4IGFzIGFueSkuc2lnbmFsID0gc2lnbmFsO1xuICAgICAgfVxuICAgICAgKGV4IGFzIGFueSkuY21kID0gX2NtZDtcbiAgICAgIHJlamVjdChleCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3JoYW5kbGVyKGU6IEVycm9yKSB7XG4gICAgICBleCA9IGU7XG4gICAgICBpZiAoY2hpbGQuc3Rkb3V0KSB7XG4gICAgICAgIGNoaWxkLnN0ZG91dC5kZXN0cm95KCk7XG4gICAgICB9XG4gICAgICBpZiAoY2hpbGQuc3RkZXJyKSB7XG4gICAgICAgIGNoaWxkLnN0ZGVyci5kZXN0cm95KCk7XG4gICAgICB9XG4gICAgICBleGl0aGFuZGxlcihudWxsLCBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBraWxsKCkge1xuICAgICAgaWYgKGNoaWxkLnN0ZG91dCkge1xuICAgICAgICBjaGlsZC5zdGRvdXQuZGVzdHJveSgpO1xuICAgICAgfVxuICAgICAgaWYgKGNoaWxkLnN0ZGVycikge1xuICAgICAgICBjaGlsZC5zdGRlcnIuZGVzdHJveSgpO1xuICAgICAgfVxuXG4gICAgICBraWxsZWQgPSB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY2hpbGQua2lsbCgnU0lHVEVSTScpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBleCA9IGUgYXMgRXJyb3I7XG4gICAgICAgIGV4aXRoYW5kbGVyKG51bGwsIG51bGwpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaGlsZC5zdGRvdXQpIHtcbiAgICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIGZ1bmN0aW9uIG9uQ2hpbGRTdGRvdXQoY2h1bmspIHtcbiAgICAgICAgc3Rkb3V0TGVuICs9IGNodW5rLmxlbmd0aDtcbiAgICAgICAgaWYgKHN0ZG91dExlbiA+IE1BWF9CVUZGRVIpIHtcbiAgICAgICAgICBleCA9IG5ldyBFcnJvcignRXhjZWVkIG1heCBidWZmZXIgc2l6ZScpO1xuICAgICAgICAgIGtpbGwoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBfc3Rkb3V0LnB1c2goY2h1bmspO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcignQ2FuXFwndCBjcmVhdGUgc3Rkb3V0JykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNoaWxkLm9uKCdjbG9zZScsIGV4aXRoYW5kbGVyKTtcbiAgICBjaGlsZC5vbignZXJyb3InLCBlcnJvcmhhbmRsZXIpO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnQoYnVmZmVyOiBCdWZmZXIsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG4gIHJldHVybiBfaW1hZ2VtYWdpY2soJ2NvbnZlcnQnLCBidWZmZXIsIFsnLScsIC4uLmFyZ3MsICctJ10pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaWRlbnRpZnkoYnVmZmVyOiBCdWZmZXIsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG4gIHJldHVybiBfaW1hZ2VtYWdpY2soJ2lkZW50aWZ5JywgYnVmZmVyLCBbLi4uYXJncywgJy0nXSk7XG59Il19