import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface ThresholdOpts extends IActionOpts {
    threshold: number;
}
export declare class ThresholdAction extends BaseImageAction {
    readonly name: string;
    beforeProcess(ctx: IImageContext, params: string[], _: number): void;
    validate(params: string[]): ReadOnly<ThresholdOpts>;
    process(_1: IImageContext, _2: string[]): Promise<void>;
}
