import * as sharp from 'sharp';
import { IImageContext } from '.';
import { IActionOpts, ReadOnly, InvalidArgument } from '..';
import * as is from '../../is';
import { BaseImageAction } from './_base';

export interface RotateOpts extends IActionOpts {
  degree: number;
}

export class RotateAction extends BaseImageAction {
  public readonly name: string = 'rotate';

  public validate(params: string[]): ReadOnly<RotateOpts> {
    let opt: RotateOpts = { degree: 0 };

    if (params.length !== 2) {
      throw new InvalidArgument('Rotate param error, e.g: rotate,90');
    }
    const d = Number.parseInt(params[1], 10);
    if (is.inRange(d, 0, 360)) {
      opt.degree = d;
    } else {
      throw new InvalidArgument('Rotate must be between 0 and 360');
    }
    return opt;
  }


  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    ctx.image = sharp(await ctx.image.toBuffer()).rotate(opt.degree, {
      background: '#ffffff',
    });
  }
}