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
import config from '../../config';

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

    // 获取安全的MIME类型，确保不返回HEIF/HEIC
    public getSafeMimeType(type: string): string {
        if (!type) return 'image/jpeg'; // 默认安全类型

        const normalizedType = type.toLowerCase();
        // 处理常见图像格式
        if (normalizedType === 'jpeg' || normalizedType === 'jpg') return 'image/jpeg';
        if (normalizedType === 'png') return 'image/png';
        if (normalizedType === 'webp') return 'image/webp';
        if (normalizedType === 'avif') return 'image/avif';
        if (normalizedType === 'gif') return 'image/gif';
        if (normalizedType === 'tiff' || normalizedType === 'tif') return 'image/tiff';
        if (normalizedType === 'svg') return 'image/svg+xml';

        // 禁止返回HEIF/HEIC格式
        if (normalizedType === 'heif' || normalizedType === 'heic' ||
            normalizedType.includes('heif') || normalizedType.includes('heic')) {
            console.log(`在MIME类型处理中检测到HEIF/HEIC格式: ${normalizedType}，转换为JPEG`);
            return 'image/jpeg';
        }

        // 如果是完整的MIME类型
        if (normalizedType.includes('/')) return normalizedType;

        // 默认使用安全格式
        return 'image/jpeg';
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
        const imageBuffer = await bufferStore.get(uri);
        console.log(`ImageProcessor.newContext: Loaded image ${uri}. Buffer length: ${imageBuffer.buffer.length}`);
        console.log(`ImageProcessor.newContext: Sharp versions: ${JSON.stringify(sharp.versions)}`);

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
        let image;
        let metadata;
        if (ctx.features[Features.LimitAnimatedFrames] > 0) {
            image = sharp(imageBuffer.buffer, { failOnError: false, animated: false });
            metadata = await image.metadata();
            if (!('gif' === metadata.format)) {
                throw new InvalidArgument('Format must be Gif');
            }
            if (!(metadata.pages)) {
                throw new InvalidArgument('Can\'t read gif\'s pages');
            }
            const pages = Math.min(ctx.features[Features.LimitAnimatedFrames], metadata.pages);
            image = sharp(imageBuffer.buffer, { failOnError: false, animated: ctx.features[Features.ReadAllAnimatedFrames], pages });
            // 应用图像处理管道优化
            image = this.optimizeImageProcessingPipeline(image);
            metadata = await image.metadata();
        } else {
            image = sharp(imageBuffer.buffer, { failOnError: false, animated: ctx.features[Features.ReadAllAnimatedFrames] });
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

        if (metadata.format && (metadata.format.toLowerCase() === 'heic' || metadata.format.toLowerCase() === 'heif')) {
            console.log(`ImageProcessor.newContext: Input image format is HEIC/HEIF (${metadata.format}). Sharp will attempt to decode this.`);
        }

        return {
            uri: ctx.uri,
            actions: ctx.actions,
            mask: ctx.mask,
            bufferStore: ctx.bufferStore,
            features: ctx.features,
            headers: Object.assign(ctx.headers, imageBuffer.headers),
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

        if (ctx.features[Features.AutoOrient]) {
            console.log('ImageProcessor.process: Applying auto-orientation.');
            ctx.image.rotate();
        }

        ctx.mask.forEachAction((action, _, index) => {
            if ((this.name === action) || (!action)) {
                return;
            }
            const params = action.split(',');
            const name = params[0];
            const act = this.action(name);
            if (!act) {
                console.error(`ImageProcessor.process: Unknown action: "${name}"`);
                throw new InvalidArgument(`Unknown action: "${name}"`);
            }
            console.log(`ImageProcessor.process: Before processing action "${name}" with params: ${params.slice(1).join(',')}`);
            act.beforeProcess.bind(act)(ctx, params, index);
        });

        const enabledActions = ctx.mask.filterEnabledActions();
        console.log(`ImageProcessor.process: Enabled actions for processing: ${JSON.stringify(enabledActions)}`);
        // const nothing2do = (enabledActions.length === 0) || ((enabledActions.length === 1) && (this.name === enabledActions[0]));
        // The above check is too simple. If only 'format' and 'quality' are present, it IS something to do.
        // A better check: are there any actions other than 'image' itself?
        const hasMeaningfulActions = enabledActions.some(action => action !== this.name && action.trim() !== '');

        if (!hasMeaningfulActions && !ctx.features[Features.AutoWebp]) {
            console.log('ImageProcessor.process: No meaningful actions to perform and AutoWebp is off. Returning original image.');
            const { buffer, headers: originalHeaders } = await ctx.bufferStore.get(ctx.uri);
            const originalMetadata = await sharp(buffer).metadata(); // Get metadata of the original buffer
            const finalFormat = originalMetadata.format || 'jpeg'; // Fallback if format is undefined

            console.log(`ImageProcessor.process: Original image format: ${finalFormat}`);
            ctx.headers['Content-Type'] = this.getSafeMimeType(finalFormat);
            ctx.headers['Content-Disposition'] = 'inline';
            // Merge original headers (like ETag from S3) if any, but prioritize our Content-Type and Disposition
            Object.assign(ctx.headers, originalHeaders, {
                'Content-Type': this.getSafeMimeType(finalFormat),
                'Content-Disposition': 'inline'
            });

            console.log(`ImageProcessor.process: Returning original image with Content-Type: ${ctx.headers['Content-Type']}`);
            return { data: buffer, type: finalFormat };
        }

        for (const action of enabledActions) {
            if ((this.name === action) || (!action) || action.trim() === '') {
                continue;
            }
            const params = action.split(',');
            const name = params[0];
            const act = this.action(name);
            if (!act) {
                console.error(`ImageProcessor.process: Unknown action during processing loop: "${name}"`);
                throw new InvalidArgument(`Unknown action: "${name}"`);
            }
            console.log(`ImageProcessor.process: Executing action "${name}" with params: ${params.slice(1).join(',')}`);
            await act.process(ctx, params);
            console.log(`ImageProcessor.process: Finished action "${name}"`);
            if (ctx.features[Features.ReturnInfo]) {
                console.log('ImageProcessor.process: ReturnInfo feature enabled, breaking action loop.');
                break;
            }
        }

        if (ctx.features[Features.AutoWebp] && ctx.metadata.format !== 'webp') {
            console.log('ImageProcessor.process: AutoWebp feature enabled and current format is not webp. Converting to WebP.');
            ctx.image.webp({ quality: config.defaultQuality.webp }); // Use default webp quality from config
            ctx.metadata.format = 'webp'; // Update metadata format
        }

        if (ctx.features[Features.ReturnInfo]) {
            console.log('ImageProcessor.process: Returning image info (JSON).');
            ctx.headers['Content-Type'] = 'application/json';
            return { data: ctx.info, type: 'application/json' };
        } else {
            console.log('ImageProcessor.process: Converting final image to buffer.');
            const { data, info } = await ctx.image.toBuffer({ resolveWithObject: true });

            // ERROR
            console.log(`ImageProcessor.process: Final image buffer created. Sharp info: format=${info.format}, size=${info.size}, width=${info.width}, height=${info.height}`);

            let finalOutputFormat = info.format;

            // Check if we requested AVIF but got HEIF in return (Sharp sometimes identifies AVIF as HEIF)
            if (ctx.metadata.format === 'avif' && finalOutputFormat === 'heif') {
                console.log(`ImageProcessor.process: Requested AVIF format but Sharp returned HEIF. Treating as AVIF.`);
                finalOutputFormat = 'avif';
                ctx.headers['Content-Type'] = 'image/avif';
            }
            // Double check for HEIF/HEIC and convert to JPEG if somehow it's the output format
            // Skip this check if we explicitly requested AVIF format
            else if (finalOutputFormat && (finalOutputFormat.toLowerCase().includes('heif') || finalOutputFormat.toLowerCase().includes('heic'))) {
                console.warn(`ImageProcessor.process: Detected HEIF/HEIC format (${finalOutputFormat}) in final output from Sharp. Forcing JPEG conversion.`);
                const jpegBuffer = await sharp(data).jpeg({ quality: config.defaultQuality.jpeg, mozjpeg: true }).toBuffer();
                finalOutputFormat = 'jpeg';
                // ctx.headers['Content-Type'] = 'image/jpeg'; // Will be set by getSafeMimeType
                console.log('ImageProcessor.process: Successfully re-converted to JPEG.');
                // Return the re-converted JPEG data
                ctx.headers['Content-Type'] = this.getSafeMimeType(finalOutputFormat);
                ctx.headers['Content-Disposition'] = 'inline';
                console.log(`ImageProcessor.process: Final headers after HEIC/HEIF re-conversion: ${JSON.stringify(ctx.headers)}`);
                return { data: jpegBuffer, type: finalOutputFormat };
            }

            // Set Content-Type based on the actual format returned by sharp.toBuffer()
            ctx.headers['Content-Type'] = this.getSafeMimeType(finalOutputFormat);
            ctx.headers['Content-Disposition'] = 'inline'; // Ensure inline display

            console.log(`ImageProcessor.process: Final headers for response: ${JSON.stringify(ctx.headers)}`);
            return { data: data, type: finalOutputFormat };
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
