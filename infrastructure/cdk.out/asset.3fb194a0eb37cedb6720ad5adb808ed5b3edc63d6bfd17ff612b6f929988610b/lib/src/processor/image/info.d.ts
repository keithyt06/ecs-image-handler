import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export declare class InfoAction extends BaseImageAction {
    readonly name: string;
    beforeProcess(ctx: IImageContext, _2: string[], index: number): void;
    validate(params: string[]): ReadOnly<IActionOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
