import { IImageContext } from '.';
import { IActionOpts, ReadOnly, InvalidArgument, Features, IProcessContext } from '..';
import config from '../../config';
import { BaseImageAction } from './_base';

export interface FormatOpts extends IActionOpts {
  format: string;
}

export class FormatAction extends BaseImageAction {
  public readonly name: string = 'format';

  public beforeNewContext(ctx: IProcessContext, params: string[]): void {
    const opts = this.validate(params);
    if (['webp', 'avif', 'gif'].includes(opts.format)) {
      ctx.features[Features.ReadAllAnimatedFrames] = true;
    } else {
      ctx.features[Features.ReadAllAnimatedFrames] = false;
    }
  }

  public beforeProcess(ctx: IImageContext, params: string[], index: number): void {
    const opts = this.validate(params);
    if (('gif' === ctx.metadata.format) && ('gif' === opts.format)) {
      ctx.mask.disable(index);
    }
  }

  public validate(params: string[]): ReadOnly<FormatOpts> {
    let opt: FormatOpts = { format: '' };

    if (params.length !== 2) {
      throw new InvalidArgument(`Format param error, e.g: format,jpg (${SUPPORTED_FORMAT.join(',')})`);
    }
    opt.format = params[1];

    if (!SUPPORTED_FORMAT.includes(opt.format)) {
      throw new InvalidArgument(`Format must be one of ${SUPPORTED_FORMAT.join(',')}`);
    }

    return opt;
  }


  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    if (ctx.features[Features.AutoWebp]) {
      ctx.features[Features.AutoWebp] = false;
    }

    const opt = this.validate(params);
    if ('gif' === opt.format) {
      return; // nothing to do
    }
    
    // 确保格式转换一定生效
    if (['jpeg', 'jpg'].includes(opt.format)) {
      ctx.metadata.format = 'jpeg';
      ctx.image.jpeg({ 
        quality: config.defaultQuality.jpeg,
        mozjpeg: true  // 使用更高效的mozjpeg编码器
      });
    } else if (opt.format === 'png') {
      ctx.metadata.format = 'png';
      ctx.image.png({ 
        effort: 4,  // 增加压缩效率
        compressionLevel: 8,  // 增加压缩级别
        adaptiveFiltering: true  // 启用自适应过滤
      });
    } else if (opt.format === 'webp') {
      ctx.metadata.format = 'webp';
      ctx.image.webp({ 
        effort: 4,  // 增加压缩效率
        quality: config.defaultQuality.webp,
        alphaQuality: 100  // 保持透明度质量
      });
    } else if (opt.format === 'avif') {
      ctx.metadata.format = 'avif';
      ctx.image.avif({ 
        effort: 4,  // 平衡速度和质量
        quality: config.defaultQuality.avif || 80,
        chromaSubsampling: '4:4:4',  // 提高颜色精度
        lossless: false  // 使用有损压缩以获得更好的压缩率
      });
    }
  }
}

const SUPPORTED_FORMAT = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif', // Added AVIF support
  'gif',
];
