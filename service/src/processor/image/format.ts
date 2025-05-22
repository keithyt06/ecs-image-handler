import { IImageContext } from '.';
import { IActionOpts, ReadOnly, InvalidArgument, Features, IProcessContext } from '..';
import { BaseImageAction } from './_base';

// Define supported formats as a const array for runtime checks
// and a type for compile-time type safety.
const SUPPORTED_FORMAT_VALUES = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
] as const; // Use 'as const' for a literal type

// Create a union type from the const array values
type SupportedFormat = typeof SUPPORTED_FORMAT_VALUES[number];

export interface FormatOpts extends IActionOpts {
  format: SupportedFormat; // Use the stricter type here
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
    if (params.length !== 2) {
      throw new InvalidArgument(`Format param error, e.g: format,jpg (${SUPPORTED_FORMAT_VALUES.join(',')})`);
    }
    const requestedFormat = params[1].toLowerCase();
    console.log(`FormatAction.validate: Validating format - ${requestedFormat}`);

    let finalFormat: SupportedFormat = 'jpeg'; // Default to jpeg

    if (FORBIDDEN_FORMAT.includes(requestedFormat)) {
      console.warn(`FormatAction.validate: Forbidden format ${requestedFormat} detected, defaulting to jpeg.`);
      // finalFormat is already 'jpeg' as per default initialization
    } else {
      // Check if requestedFormat is one of the SUPPORTED_FORMAT_VALUES
      let isSupported = false;
      for (const fmt of SUPPORTED_FORMAT_VALUES) {
        if (fmt === requestedFormat) {
          finalFormat = fmt;
          isSupported = true;
          break;
        }
      }
      if (!isSupported) {
        console.error(`FormatAction.validate: Unsupported format ${requestedFormat}. Supported are: ${SUPPORTED_FORMAT_VALUES.join(', ')}`);
        throw new InvalidArgument(`Format must be one of ${SUPPORTED_FORMAT_VALUES.join(',')}`);
      }
    }
    return { format: finalFormat };
  }

  public async process(ctx: IImageContext, params: string[]): Promise<void> {
    const opts = this.validate(params); // opts.format is now of type SupportedFormat
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

// const SUPPORTED_FORMAT = [ ... ]; // This is now replaced by SUPPORTED_FORMAT_VALUES

// 明确禁止的格式
const FORBIDDEN_FORMAT = [
  'heif',
  'heic'
];
