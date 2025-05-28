import { IImageContext } from '.';
import { IActionOpts, ReadOnly, IProcessContext } from '..';
import { BaseImageAction } from './_base';
export interface AutoOrientOpts extends IActionOpts {
    auto: boolean;
}
export declare class AutoOrientAction extends BaseImageAction {
    readonly name: string;
    beforeNewContext(ctx: IProcessContext, _: string[]): void;
    beforeProcess(ctx: IImageContext, _2: string[], index: number): void;
    validate(params: string[]): ReadOnly<AutoOrientOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
