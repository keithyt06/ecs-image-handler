import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export declare const enum Mode {
    LFIT = "lfit",
    MFIT = "mfit",
    FILL = "fill",
    PAD = "pad",
    FIXED = "fixed"
}
export interface ResizeOpts extends IActionOpts {
    m?: Mode;
    w?: number;
    h?: number;
    l?: number;
    s?: number;
    limit?: boolean;
    color?: string;
    p?: number;
}
export declare class ResizeAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<ResizeOpts>;
    beforeProcess(ctx: IImageContext, params: string[], index: number): void;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
