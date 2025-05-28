import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface CircleOpts extends IActionOpts {
    r: number;
}
export declare class CircleAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<CircleOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
