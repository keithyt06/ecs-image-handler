import * as sharp from 'sharp';
import { Features, IAction, InvalidArgument, IProcessContext, IProcessor, IProcessResponse } from '../../processor';
import { IBufferStore } from '../../store';
import { ActionMask } from './_base';
import { AutoOrientAction } from './auto-orient';
import { BlurAction } from './blur';
import { BrightAction } from './bright';
import { CgifAction } from './cgif';
import { CircleAction } from './circle';
import { ContrastAction } from './contrast';
import { CropAction } from './crop';
import { FormatAction } from './format';
import { GreyAction } from './grey';
import { IndexCropAction } from './indexcrop';
import { InfoAction } from './info';
import { InterlaceAction } from './interlace';
import { QualityAction } from './quality';
import { ResizeAction } from './resize';
import { RotateAction } from './rotate';
import { RoundedCornersAction } from './rounded-corners';
import { SharpenAction } from './sharpen';
import { StripMetadataAction } from './strip-metadata';
import { ThresholdAction } from './threshold';
import { WatermarkAction } from './watermark';

export interface IImageInfo {
  [key: string]: { value: string };
}
export interface IImageContext extends IProcessContext {
  image: sharp.Sharp;
  metadata: sharp.Metadata;
  info?: IImageInfo;
}

const MB = 1024 * 1024;

export class ImageProcessor implements IProcessor {
  public static getInstance(): ImageProcessor {
    if (!ImageProcessor._instance) {
      ImageProcessor._instance = new ImageProcessor();
    }
    return ImageProcessor._instance;
  }
  private static _instance: ImageProcessor;
  private readonly _actions: { [name: string]: IAction } = {};
  private _maxGifSizeMB: number = 5;
  private _maxGifPages: number = 100;

  public readonly name: string = 'image';

  private constructor() { 
    // 设置处理器初始化日志，便于调试
    console.debug('ImageProcessor initialized');
  }

  // 添加优化图像处理管道的辅助方法
  private optimizeImageProcessingPipeline(image: sharp.Sharp): sharp.Sharp {
    // 设置更高效的处理模式
    return image.timeout({ seconds: 60 }); // 增加超时，处理大图
    // 注意: limitInputPixels 在当前Sharp版本中不可用
  }

  public setMaxGifSizeMB(value: number) {
    if (value > 0) {
      this._maxGifSizeMB = value;
    } else {
      console.warn(`Max gif size must > 0, but the value is ${value}`);
    }
  }

  public setMaxGifPages(value: number) {
    if (value > 0) {
      this._maxGifPages = value;
    } else {
      console.warn(`Max gif pages must > 0, but the value is ${value}`);
    }
  }

  public async newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IImageContext> {
    const ctx: IProcessContext = {
      uri,
      actions,
      mask: new ActionMask(actions),
      bufferStore,
      features: {
        [Features.AutoOrient]: true,
        [Features.ReadAllAnimatedFrames]: true,
      },
      headers: {},
    };
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if ((this.name === action) || (!action)) {
        continue;
      }
      // "<action-name>,<param-1>,<param-2>,..."
      const params = action.split(',');
      const name = params[0];
      const act = this.action(name);
      if (!act) {
        throw new InvalidArgument(`Unkown action: "${name}"`);
      }
      act.beforeNewContext.bind(act)(ctx, params, i);
    }
    const { buffer, headers } = await bufferStore.get(uri);
    let image;
    let metadata;
    if (ctx.features[Features.LimitAnimatedFrames] > 0) {
      image = sharp(buffer, { failOnError: false, animated: false });
      metadata = await image.metadata();
      if (!('gif' === metadata.format)) {
        throw new InvalidArgument('Format must be Gif');
      }
      if (!(metadata.pages)) {
        throw new InvalidArgument('Can\'t read gif\'s pages');
      }
      const pages = Math.min(ctx.features[Features.LimitAnimatedFrames], metadata.pages);
      image = sharp(buffer, { failOnError: false, animated: ctx.features[Features.ReadAllAnimatedFrames], pages });
      // 应用图像处理管道优化
      image = this.optimizeImageProcessingPipeline(image);
      metadata = await image.metadata();
    } else {
      image = sharp(buffer, { failOnError: false, animated: ctx.features[Features.ReadAllAnimatedFrames] });
      // 应用图像处理管道优化
      image = this.optimizeImageProcessingPipeline(image);
      metadata = await image.metadata();
    }
    if ('gif' === metadata.format) {
      image.gif({ effort: 1 }); // https://github.com/lovell/sharp/issues/3176

      if (metadata.size && metadata.size > (this._maxGifSizeMB * MB)) {
        console.log(`Gif processing skipped. The image size exceeds ${this._maxGifSizeMB} MB`);
        ctx.mask.disableAll();
      } else if (metadata.pages && metadata.pages > this._maxGifPages) {
        console.log(`Gif processing skipped. The image pages exceeds ${this._maxGifPages}`);
        ctx.mask.disableAll();
      }
    }
    if ('png' === metadata.format && metadata.size && metadata.size > (5 * MB)) {
      image.png({ adaptiveFiltering: true });
    }

    return {
      uri: ctx.uri,
      actions: ctx.actions,
      mask: ctx.mask,
      bufferStore: ctx.bufferStore,
      features: ctx.features,
      headers: Object.assign(ctx.headers, headers),
      metadata,
      image,
    };
  }

  public async process(ctx: IImageContext): Promise<IProcessResponse> {
    if (!ctx.image) {
      throw new InvalidArgument('Invalid image context! No "image" field.');
    }
    if (!ctx.actions) {
      throw new InvalidArgument('Invalid image context! No "actions" field.');
    }

    if (ctx.features[Features.AutoOrient]) { ctx.image.rotate(); }

    ctx.mask.forEachAction((action, _, index) => {
      if ((this.name === action) || (!action)) {
        return;
      }
      // "<action-name>,<param-1>,<param-2>,..."
      const params = action.split(',');
      const name = params[0];
      const act = this.action(name);
      if (!act) {
        throw new InvalidArgument(`Unkown action: "${name}"`);
      }
      act.beforeProcess.bind(act)(ctx, params, index);
    });
    const enabledActions = ctx.mask.filterEnabledActions();
    const nothing2do = (enabledActions.length === 0) || ((enabledActions.length === 1) && (this.name === enabledActions[0]));

    if (nothing2do && (!ctx.features[Features.AutoWebp])) {
      const { buffer } = await ctx.bufferStore.get(ctx.uri);
      
      // 确保即使直接返回原图也设置正确的响应头
      ctx.headers['Content-Type'] = getMimeType(ctx.metadata.format!);
      ctx.headers['Content-Disposition'] = 'inline'; // 强制浏览器显示而非下载
      
      return { data: buffer, type: ctx.metadata.format! };
    }
    
    // 辅助函数 - 获取MIME类型
    function getMimeType(type: string): string {
      // 处理常见图像格式
      if (type === 'jpeg' || type === 'jpg') return 'image/jpeg';
      if (type === 'png') return 'image/png';
      if (type === 'webp') return 'image/webp';
      if (type === 'avif') return 'image/avif';
      if (type === 'gif') return 'image/gif';
      if (type.includes('/')) return type;
      return `image/${type}`;
    }

    for (const action of enabledActions) {
      if ((this.name === action) || (!action)) {
        continue;
      }
      // "<action-name>,<param-1>,<param-2>,..."
      const params = action.split(',');
      const name = params[0];
      const act = this.action(name);
      if (!act) {
        throw new InvalidArgument(`Unkown action: "${name}"`);
      }
      await act.process(ctx, params);

    if (ctx.features[Features.ReturnInfo]) { break; }
  }
  if (ctx.features[Features.AutoWebp]) { ctx.image.webp(); }
  if (ctx.features[Features.ReturnInfo]) {
    return { data: ctx.info, type: 'application/json' };
  } else {
    const { data, info } = await ctx.image.toBuffer({ resolveWithObject: true });
    
    // 确保设置正确的Content-Disposition，防止下载而非显示
    if (!ctx.headers['Content-Disposition']) {
      ctx.headers['Content-Disposition'] = 'inline';
    }
    
    // 显式拦截HEIF/HEIC格式，强制转换为JPEG
    if (info.format && (info.format.toLowerCase().includes('heif') || info.format.toLowerCase().includes('heic'))) {
      console.log(`在最终输出阶段检测到禁止的格式 ${info.format}，强制转换为JPEG`);
      // 重新进行处理，转换为JPEG
      ctx.image.jpeg({ 
        quality: 85,
        mozjpeg: true,
        optimiseCoding: true,
        trellisQuantisation: true 
      });
      const jpegResult = await ctx.image.toBuffer();
      ctx.headers['Content-Type'] = 'image/jpeg';
      return { data: jpegResult, type: 'image/jpeg' };
    }
    
    // 确保AVIF格式正确标记
    if (info.format === 'avif' && !ctx.headers['Content-Type']) {
      ctx.headers['Content-Type'] = 'image/avif';
    }
    
    // 安全检查：确保任何输出都不是HEIF/HEIC格式
    let safeType = info.format;
    if (!safeType || safeType.toLowerCase().includes('heif') || safeType.toLowerCase().includes('heic')) {
      safeType = 'jpeg';
    }
    
    // 设置安全的MIME类型
    const safeFormat = 'image/' + safeType;
    ctx.headers['Content-Type'] = safeFormat;
    
    return { data: data, type: safeFormat };
  }
  }

  public action(name: string): IAction {
    return this._actions[name];
  }

  public register(...actions: IAction[]): void {
    for (const action of actions) {
      if (!this._actions[action.name]) {
        this._actions[action.name] = action;
      }
    }
  }
}

// Register actions
ImageProcessor.getInstance().register(
  new ResizeAction(),
  new QualityAction(),
  new BrightAction(),
  new FormatAction(),
  new BlurAction(),
  new RotateAction(),
  new ContrastAction(),
  new SharpenAction(),
  new InterlaceAction(),
  new AutoOrientAction(),
  new GreyAction(),
  new CropAction(),
  new CircleAction(),
  new IndexCropAction(),
  new RoundedCornersAction(),
  new WatermarkAction(),
  new InfoAction(),
  new CgifAction(),
  new StripMetadataAction(),
  new ThresholdAction(),
);
