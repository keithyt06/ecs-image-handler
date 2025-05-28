import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface BlurOpts extends IActionOpts {
    r: number;
    s: number;
}
export declare class BlurAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<BlurOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
