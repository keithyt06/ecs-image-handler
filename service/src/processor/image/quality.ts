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
    // If the image is a GIF and we are not changing format, quality action is usually irrelevant or not applicable.
    if (ctx.metadata.format && ctx.metadata.format.toLowerCase() === 'gif') {
      // Check if a format action to something other than GIF is also present and enabled
      let willChangeFormatFromGif = false;
      ctx.mask.forEachAction((actionName, enabled) => {
        if (enabled && actionName.startsWith('format,') && !actionName.includes(',gif')) {
          willChangeFormatFromGif = true;
        }
      });
      if (!willChangeFormatFromGif) {
        console.log('QualityAction.beforeProcess: GIF format detected and no conversion to another format. Disabling quality action.');
        ctx.mask.disable(index);
      }
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
    const metadata = ctx.metadata; // This should reflect the target format if FormatAction ran.
    let qualityValue: number;

    console.log(`QualityAction.process: Processing quality for format: ${metadata.format}. Requested q=${opt.q}, Q=${opt.Q}`);

    try {
      if (JPEG === metadata.format || JPG === metadata.format) {
        qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.jpeg;
        let q = qualityValue; // Use absolute quality directly if Q or default, otherwise calculate from relative q
        if (opt.q && !opt.Q) { // Only calculate if relative q is given and absolute Q is not
          const buffer = await ctx.image.clone().jpeg({ quality: 100 }).toBuffer(); // Get a baseline
          const estq = jpeg.decode(buffer).quality; //This jpeg.decode might not be perfectly accurate
          q = Math.round(estq * opt.q / 100);
          console.log(`QualityAction.process: JPEG relative quality: original_est_q=${estq}, requested_relative_q=${opt.q}, final_q=${q}`);
        }
        console.log(`QualityAction.process: Applying JPEG quality: ${q}`);
        ctx.image.jpeg({ quality: q, mozjpeg: true, optimiseCoding: true, trellisQuantisation: true });
      } else if (WEBP === metadata.format) {
        qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.webp;
        console.log(`QualityAction.process: Applying WebP quality: ${qualityValue}`);
        ctx.image.webp({ quality: qualityValue, effort: 4, alphaQuality: 100, smartSubsample: true });
      } else if ('avif' === metadata.format) {
        qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.avif;
        console.log(`QualityAction.process: Applying AVIF quality: ${qualityValue}, effort: 4, chromaSubsampling: 4:2:0`);
        ctx.image.avif({ quality: qualityValue, effort: 4, chromaSubsampling: '4:2:0', lossless: false });
      } else if ('png' === metadata.format) {
        qualityValue = opt.q ?? opt.Q ?? config.defaultQuality.png;
        const compressionLevel = Math.max(0, Math.min(9, Math.floor(9 - (qualityValue - 1) / 11)));
        const effort = Math.max(1, Math.min(10, Math.ceil(qualityValue / 10)));
        console.log(`QualityAction.process: Applying PNG quality (interpreted as CL=${compressionLevel}, effort=${effort}) from input quality ${qualityValue}`);
        ctx.image.png({ compressionLevel: compressionLevel, adaptiveFiltering: true, effort: effort, palette: false });
      } else {
        console.log(`QualityAction.process: No specific quality processing for format ${metadata.format}.`);
      }
      // Content-Type should be set by ImageProcessor based on the final buffer information.
      // ctx.headers['Content-Disposition'] = 'inline'; // This can also be centralized in ImageProcessor
    } catch (error) {
      console.error(`QualityAction.process: Error during format conversion/quality setting for ${metadata.format} with quality ${opt.q || opt.Q}:`, error);
      // Do not re-throw, allow pipeline to continue if possible, or let ImageProcessor handle final output.
      // If a specific format conversion failed here, ImageProcessor might output original or last successful state.
    }
  }
}
