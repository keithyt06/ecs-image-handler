import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface BrightOpts extends IActionOpts {
    bright: number;
}
export declare class BrightAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<BrightOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
