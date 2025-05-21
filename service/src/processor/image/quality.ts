import * as sharp from 'sharp';
import { IImageContext } from '.';
import { IActionOpts, InvalidArgument, ReadOnly } from '..';
import * as is from '../../is';
import { BaseImageAction } from './_base';
import * as jpeg from './jpeg';


const JPG = 'jpg';
const JPEG = sharp.format.jpeg.id;
const WEBP = sharp.format.webp.id;

export interface QualityOpts extends IActionOpts {
  q?: number;
  Q?: number;
}

export class QualityAction extends BaseImageAction {
  public readonly name: string = 'quality';

  public beforeProcess(ctx: IImageContext, _2: string[], index: number): void {
    if ('gif' === ctx.metadata.format) {
      ctx.mask.disable(index);
    }
  }

  public validate(params: string[]): ReadOnly<QualityOpts> {
    const opt: QualityOpts = {};
    for (const param of params) {
      if ((this.name === param) || (!param)) {
        continue;
      }
      const [k, v] = param.split('_');
      if (k === 'q') {
        const q = Number.parseInt(v, 10);
        if (is.inRange(q, 1, 100)) {
          opt.q = q;
        } else {
          throw new InvalidArgument('Quality must be between 1 and 100');
        }
      } else if (k === 'Q') {
        const Q = Number.parseInt(v, 10);
        if (is.inRange(Q, 1, 100)) {
          opt.Q = Q;
        } else {
          throw new InvalidArgument('Quality must be between 1 and 100');
        }
      } else {
        throw new InvalidArgument(`Unkown param: "${k}"`);
      }
    }
    return opt;
  }
  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opt = this.validate(params);
    const metadata = ctx.metadata; // If the format is changed before.
    
    // 获取最终质量值，基于格式设置不同的默认值
    let qualityValue: number;
    
    if (JPEG === metadata.format || JPG === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? 85; // JPEG默认质量更高
      let q = 72;
      if (opt.q) {
        const buffer = await ctx.image.toBuffer();
        const estq = jpeg.decode(buffer).quality;
        q = Math.round(estq * opt.q / 100);
      } else if (opt.Q) {
        q = opt.Q;
      } else {
        q = qualityValue; // 使用默认值
      }
      ctx.image.jpeg({ 
        quality: q, 
        mozjpeg: true,
        optimiseCoding: true,
        trellisQuantisation: true
      });
      
      // 确保设置正确的MIME类型
      ctx.headers['Content-Type'] = 'image/jpeg';
    } else if (WEBP === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? 80; // WebP默认质量
      ctx.image.webp({ 
        quality: qualityValue, 
        effort: 4, // 平衡效率和质量
        alphaQuality: 100, // 保持透明度质量
        smartSubsample: true // 智能色度子采样
      });
      
      ctx.headers['Content-Type'] = 'image/webp';
    } else if ('avif' === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? 60; // AVIF默认较低质量以提高兼容性
      ctx.image.avif({ 
        quality: qualityValue, 
        effort: 1, // 最低压缩级别提高兼容性
        chromaSubsampling: '4:2:0', // 更兼容的色度子采样
        speed: 8 // 更快的速度
      });
      
      ctx.headers['Content-Type'] = 'image/avif';
    } else if ('png' === metadata.format) {
      // PNG是无损的，但可以通过其他参数调整
      qualityValue = opt.q ?? opt.Q ?? 90; // PNG默认高质量
      const compressionLevel = Math.max(1, Math.min(9, Math.round((100 - qualityValue) / 10)));
      ctx.image.png({ 
        compressionLevel,
        adaptiveFiltering: true,
        effort: 5,
        palette: false
      });
      
      ctx.headers['Content-Type'] = 'image/png';
    } else if ('gif' === metadata.format) {
      // 为GIF设置默认参数
      ctx.headers['Content-Type'] = 'image/gif';
    }
    
    // 确保所有格式都有内联显示指令
    ctx.headers['Content-Disposition'] = 'inline';
    
    // 添加缓存控制头
    ctx.headers['Cache-Control'] = 'public, max-age=31536000';
  }
}
