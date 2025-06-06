import * as sharp from 'sharp';
import { IImageContext } from '.';
import { IActionOpts, InvalidArgument, ReadOnly } from '..';
import * as is from '../../is';
import { BaseImageAction } from './_base';

export const enum Mode {
  LFIT = 'lfit',
  MFIT = 'mfit',
  FILL = 'fill',
  PAD = 'pad',
  FIXED = 'fixed'
}

export interface ResizeOpts extends IActionOpts {
  m?: Mode;
  w?: number;
  h?: number;
  l?: number;
  s?: number;
  limit?: boolean;
  color?: string;
  p?: number;
}

export class ResizeAction extends BaseImageAction {
  public readonly name: string = 'resize';

  public validate(params: string[]): ReadOnly<ResizeOpts> {
    const opt: ResizeOpts = {
      m: Mode.LFIT, // 默认使用LFIT模式确保保持原始宽高比
      limit: true,
      color: '#FFFFFF',
    };
    for (const param of params) {
      if ((this.name === param) || (!param)) {
        continue;
      }
      const [k, v] = param.split('_');
      if (k === 'w') {
        opt.w = Number.parseInt(v, 10);
      } else if (k === 'h') {
        opt.h = Number.parseInt(v, 10);
      } else if (k === 'l') {
        opt.l = Number.parseInt(v, 10);
      } else if (k === 's') {
        opt.s = Number.parseInt(v, 10);
      } else if (k === 'm') {
        if (v && ((v === Mode.LFIT) || (v === Mode.MFIT) || (v === Mode.FILL) || (v === Mode.PAD) || (v === Mode.FIXED))) {
          opt.m = v;
        } else {
          throw new InvalidArgument(`Unkown m: "${v}"`);
        }
      } else if (k === 'limit') {
        if (v && (v === '0' || v === '1')) {
          opt.limit = (v === '1');
        } else {
          throw new InvalidArgument(`Unkown limit: "${v}"`);
        }
      } else if (k === 'color') {
        const color = '#' + v;
        if (is.hexColor(color)) {
          opt.color = color;
        } else {
          throw new InvalidArgument(`Unkown color: "${v}"`);
        }
      } else if (k === 'p') {
        const p = Number.parseInt(v, 10);
        if (is.inRange(p, 1, 1000)) {
          opt.p = p;
        } else {
          throw new InvalidArgument(`Unkown p: "${v}"`);
        }
      } else {
        throw new InvalidArgument(`Unkown param: "${k}"`);
      }
    }
    return opt;
  }

  public beforeProcess(ctx: IImageContext, params: string[], index: number): void {
    const metadata = ctx.metadata;
    if ('gif' === metadata.format) {
      const opt = buildSharpOpt(ctx, this.validate(params));
      const isEnlargingWidth = (opt.width && metadata.width && opt.width > metadata.width);
      const isEnlargingHeight = (opt.height && metadata.pageHeight && (opt.height > metadata.pageHeight));
      if (isEnlargingWidth || isEnlargingHeight) {
        ctx.mask.disable(index);
      }
    }
  }

  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opt = buildSharpOpt(ctx, this.validate(params));
    ctx.image.resize(null, null, opt);
  }
}

function buildSharpOpt(ctx: IImageContext, o: ResizeOpts): sharp.ResizeOptions {
  const opt: sharp.ResizeOptions = {
    width: o.w,
    height: o.h,
    // 允许图片放大，确保尺寸参数生效
    withoutEnlargement: false,
    background: o.color,
  };
  
  const metadata = ctx.metadata;
  if (!(metadata.width && metadata.height)) {
    throw new InvalidArgument('Can\'t read image\'s width and height');
  }

  // Mode 处理
  if (!o.m || o.m === Mode.LFIT) {
    // LFIT模式: 优先按宽度调整，保持原始比例
    opt.fit = sharp.fit.inside;
    
    // 如果同时指定了宽和高，优先以宽度为准重新计算高度
    if (opt.width && opt.height && metadata.width && metadata.height) {
      const targetRatio = opt.width / opt.height;
      const originalRatio = metadata.width / metadata.height;
      
      // 如果比例不匹配，按宽度为基准调整高度
      if (Math.abs(targetRatio - originalRatio) > 0.01) { // 允许小误差
        opt.height = Math.round(opt.width / originalRatio);
        console.log(`调整高度以保持原始比例: 宽度=${opt.width}, 新高度=${opt.height}`);
      }
    }
  } else if (o.m === Mode.MFIT) {
    opt.fit = sharp.fit.outside;
  } else if (o.m === Mode.FILL) {
    opt.fit = sharp.fit.cover;
  } else if (o.m === Mode.PAD) {
    opt.fit = sharp.fit.contain;
  } else if (o.m === Mode.FIXED) {
    // FIXED模式: 强制使用指定宽高，不保持原始比例
    opt.fit = sharp.fit.fill;
  }

  if (o.p && (!o.w) && (!o.h)) {
    opt.withoutEnlargement = false;
    opt.width = Math.round(metadata.width * o.p * 0.01);
  } else {
    if (o.l) {
      if (metadata.width > metadata.height) {
        opt.width = o.l;
      } else {
        opt.height = o.l;
      }
    }
    if (o.s) {
      if (metadata.height < metadata.width) {
        opt.height = o.s;
      } else {
        opt.width = o.s;
      }
    }
  }
  return opt;
}
