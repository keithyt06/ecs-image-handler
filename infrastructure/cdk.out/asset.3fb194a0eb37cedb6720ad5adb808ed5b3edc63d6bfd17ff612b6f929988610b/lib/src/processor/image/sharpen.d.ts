import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface SharpenOpts extends IActionOpts {
    sharpen: number;
}
export declare class SharpenAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<SharpenOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
