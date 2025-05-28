import { IImageContext } from '.';
import { IActionOpts, ReadOnly, InvalidArgument } from '..';
import * as is from '../../is';
import { BaseImageAction } from './_base';

export interface SharpenOpts extends IActionOpts {
  sharpen: number;
}

export class SharpenAction extends BaseImageAction {
  public readonly name: string = 'sharpen';

  public validate(params: string[]): ReadOnly<SharpenOpts> {
    const opt: SharpenOpts = { sharpen: 0 };

    if (params.length !== 2) {
      throw new InvalidArgument('Sharpen param error, e.g: sharpen,100');
    }
    const s = Number.parseInt(params[1], 10);
    if (is.inRange(s, 50, 399)) {
      opt.sharpen = s;
    } else {
      throw new InvalidArgument('Sharpen be between 50 and 399');
    }
    return opt;
  }


  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    ctx.image.sharpen(opt.sharpen / 100, 0.5, 1);
  }
}