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
    opt.format = params[1].toLowerCase();

    // 首先检查是否为明确禁止的格式
    if (FORBIDDEN_FORMAT.includes(opt.format)) {
      console.log(`检测到禁止的格式: ${opt.format}，自动转换为jpeg`);
      opt.format = 'jpeg'; // 自动转换为jpeg
    }
    // 然后检查是否为支持的格式
    else if (!SUPPORTED_FORMAT.includes(opt.format)) {
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
      ctx.headers['Content-Type'] = 'image/gif';
      ctx.headers['Content-Disposition'] = 'inline';
      return; // nothing to do
    }
    
    // 确保格式转换一定生效
    if (['jpeg', 'jpg'].includes(opt.format)) {
      ctx.metadata.format = 'jpeg';
      ctx.image.jpeg({ 
        quality: config.defaultQuality.jpeg,
        mozjpeg: true,  // 使用更高效的mozjpeg编码器
        optimiseCoding: true,  // 优化霍夫曼编码表
        trellisQuantisation: true  // 使用格子量化减少文件大小
      });
      
      // 在headers中设置正确的Content-Type
      ctx.headers['Content-Type'] = 'image/jpeg';
      ctx.headers['Content-Disposition'] = 'inline';
    } else if (opt.format === 'png') {
      ctx.metadata.format = 'png';
      ctx.image.png({ 
        effort: 6,  // 增加压缩效率 (1-10)
        compressionLevel: 9,  // 最大压缩级别 (0-9)
        adaptiveFiltering: true,  // 启用自适应过滤
        palette: false  // 对于照片类内容禁用调色板
      });
      
      ctx.headers['Content-Type'] = 'image/png';
      ctx.headers['Content-Disposition'] = 'inline';
    } else if (opt.format === 'webp') {
      ctx.metadata.format = 'webp';
      ctx.image.webp({ 
        effort: 3,  // 降低压缩级别提高兼容性
        quality: config.defaultQuality.webp,
        alphaQuality: 100,  // 保持透明度质量
        smartSubsample: true  // 智能色度子采样
      });
      
      ctx.headers['Content-Type'] = 'image/webp';
      ctx.headers['Content-Disposition'] = 'inline';
    } else if (opt.format === 'avif') {
      ctx.metadata.format = 'avif';
      
      // 打印详细日志用于调试AVIF生成
      console.log(`生成AVIF格式图片，质量参数: ${config.defaultQuality.avif || 60}`);
      
      // 使用更完善的AVIF配置
      try {
        ctx.image.avif({ 
          effort: 4,  // 中等压缩级别，平衡速度和兼容性 (0-9)
          quality: config.defaultQuality.avif || 70,  // 稍微提高质量确保兼容性
          chromaSubsampling: '4:4:4',  // 使用更高质量的子采样
          lossless: false  // 使用有损压缩
        });
        console.log("成功应用AVIF配置");
      } catch (error) {
        console.error(`AVIF格式配置失败: ${error}`);
        // 如果AVIF失败，降级到WebP
        ctx.metadata.format = 'webp';
        ctx.image.webp({
          quality: config.defaultQuality.webp || 80
        });
        console.log("AVIF失败，降级到WebP格式");
      }
      
      // 确保设置正确的AVIF MIME类型，防止被误认为HEIF
      ctx.headers['Content-Type'] = 'image/avif';
      ctx.headers['Content-Disposition'] = 'inline'; // 强制浏览器显示而非下载
    }
    
    // 添加缓存和跨域头
    ctx.headers['Cache-Control'] = 'public, max-age=31536000';
    ctx.headers['Access-Control-Allow-Origin'] = '*';
    ctx.headers['Vary'] = 'Accept'; // 表明响应根据Accept头变化
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

// 明确禁止的格式
const FORBIDDEN_FORMAT = [
  'heif',
  'heic'
];
