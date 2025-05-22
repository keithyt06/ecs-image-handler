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
    console.log(`FormatAction.beforeNewContext: Requested format is ${opts.format}`);
    if (['webp', 'avif', 'gif'].includes(opts.format)) {
      ctx.features[Features.ReadAllAnimatedFrames] = true;
      console.log(`FormatAction.beforeNewContext: Enabled ReadAllAnimatedFrames for ${opts.format}`);
    } else {
      ctx.features[Features.ReadAllAnimatedFrames] = false;
    }
  }

  public beforeProcess(ctx: IImageContext, params: string[], index: number): void {
    const opts = this.validate(params);
    // If current format is already the target format (e.g. GIF to GIF), disable this action.
    if (ctx.metadata.format && ctx.metadata.format.toLowerCase() === opts.format.toLowerCase()) {
      console.log(`FormatAction.beforeProcess: Target format ${opts.format} is same as current image format. Disabling action.`);
      ctx.mask.disable(index);
    }
  }

  public validate(params: string[]): ReadOnly<FormatOpts> {
    let opt: FormatOpts = { format: '' };

    if (params.length !== 2) {
      throw new InvalidArgument(`Format param error, e.g: format,jpg (${SUPPORTED_FORMAT.join(',')})`);
    }
    opt.format = params[1].toLowerCase();
    console.log(`FormatAction.validate: Validating format - ${opt.format}`);

    if (FORBIDDEN_FORMAT.includes(opt.format)) {
      console.warn(`FormatAction.validate: Forbidden format ${opt.format} detected, defaulting to jpeg.`);
      opt.format = 'jpeg';
    } else if (!SUPPORTED_FORMAT.includes(opt.format)) {
      console.error(`FormatAction.validate: Unsupported format ${opt.format}.`);
      throw new InvalidArgument(`Format must be one of ${SUPPORTED_FORMAT.join(',')}`);
    }
    return opt;
  }

  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opts = this.validate(params);
    console.log(`FormatAction.process: Setting target format in context to: ${opts.format}. Current image format: ${ctx.metadata.format}`);

    // Set the target format in the context. Actual conversion will be handled by QualityAction or final output.
    ctx.metadata.format = opts.format; 

    // If AutoWebp feature was set, disable it because a specific format is now being applied.
    if (ctx.features[Features.AutoWebp]) {
      console.log('FormatAction.process: Disabling AutoWebp feature due to explicit format action.');
      ctx.features[Features.AutoWebp] = false;
    }

    // Content-Type and other headers will be set by QualityAction or by ImageProcessor.process based on final output info.
    console.log(`FormatAction.process: Target format in context updated to ${ctx.metadata.format}. Headers will be set later.`);
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
