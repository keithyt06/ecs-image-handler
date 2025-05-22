import * as sharp from 'sharp';
import { IImageContext } from '.';
import { IActionOpts, InvalidArgument, ReadOnly } from '..';
import * as is from '../../is';
import { BaseImageAction } from './_base';
import * as jpeg from './jpeg';
import config from '../../config';


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
      qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.jpeg; 
      let q = 72; // Default base for relative calculation if not specified by Q or config
      if (opt.q) { // Relative quality
        const buffer = await ctx.image.toBuffer();
        const estq = jpeg.decode(buffer).quality;
        q = Math.round(estq * opt.q / 100);
      } else if (opt.Q) { // Absolute quality from Q_ param
        q = opt.Q;
      } else { // Default absolute quality from config
        q = qualityValue;
      }
      ctx.image.jpeg({ 
        quality: q, 
        mozjpeg: true,
        optimiseCoding: true,
        trellisQuantisation: true
      });
      
      ctx.headers['Content-Type'] = 'image/jpeg';
    } else if (WEBP === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.webp;
      ctx.image.webp({ 
        quality: qualityValue, 
        effort: 4, 
        alphaQuality: 100, 
        smartSubsample: true 
      });
      
      ctx.headers['Content-Type'] = 'image/webp';
    } else if ('avif' === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.avif;
      ctx.image.avif({ 
        quality: qualityValue, 
        effort: 1, 
        chromaSubsampling: '4:2:0' 
      });
      
      ctx.headers['Content-Type'] = 'image/avif';
    } else if ('png' === metadata.format) {
      qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.png;
      // Convert quality (1-100) to PNG compressionLevel (0-9 for sharp, but we'll use 1-9)
      // Higher quality means lower compressionLevel value for sharp.png()
      // So, 100 quality = level 1 (least compression), 1 quality = level 9 (most compression)
      // However, sharp.png().compressionLevel is 0-9 where 9 is highest compression.
      // Let's map: quality 100 -> effort/compressionLevel low (e.g. 1-3)
      //            quality 1   -> effort/compressionLevel high (e.g. 9)
      // A simple mapping: (100-quality)/10, clamped. Let's use effort for png like in format.ts
      // For PNG, 'quality' is more about processing effort vs file size for lossless.
      // Sharp's PNG 'quality' param (1-100) itself controls quantization if palette is true.
      // Since palette is false, we use compressionLevel and effort.
      // Let's use the qualityValue to adjust effort or compressionLevel.
      // A simpler approach: use the qualityValue for 'effort' if applicable or map to compressionLevel.
      // The existing format.ts uses fixed effort/compressionLevel for PNG.
      // For consistency, if QualityAction is used for PNG, we can make it influence compressionLevel.
      const compressionLevel = Math.max(0, Math.min(9, Math.floor(9 - (qualityValue -1) / 11))); // maps 1-100 to 9-0

      ctx.image.png({ 
        compressionLevel: compressionLevel, // quality 100 -> CL 0, quality 1 -> CL 9
        adaptiveFiltering: true,
        effort: Math.max(1, Math.min(10, Math.ceil(qualityValue / 10))), // quality 1-100 to effort 1-10
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
