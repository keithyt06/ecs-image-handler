import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface RotateOpts extends IActionOpts {
    degree: number;
}
export declare class RotateAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<RotateOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
