import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface IndexCropOpts extends IActionOpts {
    x: number;
    y: number;
    i: number;
}
export declare class IndexCropAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<IndexCropOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
