import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface RoundedCornersOpts extends IActionOpts {
    r: number;
}
export declare class RoundedCornersAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<RoundedCornersOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
