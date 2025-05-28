import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface GreyOpts extends IActionOpts {
    grey: boolean;
}
export declare class GreyAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<GreyOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
