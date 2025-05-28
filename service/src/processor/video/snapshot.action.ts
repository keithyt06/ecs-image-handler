import * as child_process from 'child_process';
import { IAction, InvalidArgument, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';

export interface VideoSnapshotOpts extends IActionOpts {
  t: number; // 指定截图时间, 单位：s
  f: string; // 指定输出图片的格式, jpg和png
  m: string; // 指定截图模式，不指定则为默认模式，根据时间精确截图。如果指定为fast，则截取该时间点之前的最近的一个关键帧。
  o: string; // 输出格式
}

export class SnapshotAction implements IAction {
  public readonly name: string = 'snapshot';

  public validate(params: string[]): ReadOnly<VideoSnapshotOpts> {
    let opt: VideoSnapshotOpts = {
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
      } else if (k === 'f') {
        if (v) {
          if (v === 'jpg') {
            opt.f = 'mjpeg';
            opt.o = 'image/jpeg';
          } else if (v === 'png') {
            opt.f = v;
            opt.o = 'image/png';
          } else {
            throw new InvalidArgument(`Unkown video snapshot format param: "${v}", must be jpg/png`);
          }
        }
      } else if (k === 'm') {
        if (v) {
          if (v !== 'fast') {
            throw new InvalidArgument(`Unkown video snapshot model param: "${v}", must be fast`);
          }
        }
      } else {
        throw new InvalidArgument(`Unkown param: "${k}"`);
      }
    }
    return opt;
  }

  public async process(ctx: IExtendedProcessContext, params: string[]): Promise<void> {
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

  public beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }

  public beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void {
    // 不需要特殊处理
  }
  
  private videoScreenShot(cmd: string, args: readonly string[]): Promise<Buffer> {
    const MB = 1024 * 1024;
    const MAX_BUFFER = 5 * MB;
    const child = child_process.spawn(cmd, args);

    return new Promise<Buffer>((resolve, reject) => {
      const _stdout: any[] = [];
      let stdoutLen = 0;

      let killed = false;
      let exited = false;
      let ex: Error | null = null;

      function exithandler(code: number | null, signal: NodeJS.Signals | null) {
        if (exited) { return; }
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
          (ex as any).killed = child.killed || killed;
          (ex as any).code = code;
          (ex as any).signal = signal;
        }
        (ex as any).cmd = _cmd;
        reject(ex);
      }

      function errorhandler(e: Error) {
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
        } catch (e) {
          ex = e as Error;
          exithandler(null, null);
        }
      }

      if (child.stdout) {
        child.stdout.on('data', function onChildStdout(chunk) {
          stdoutLen += chunk.length;
          if (stdoutLen > MAX_BUFFER) {
            ex = new Error('Exceed max buffer size');
            kill();
          } else {
            _stdout.push(chunk);
          }
        });
      } else {
        reject(new Error('Can\'t create stdout'));
        return;
      }

      child.on('close', exithandler);
      child.on('error', errorhandler);
    });
  }
}
