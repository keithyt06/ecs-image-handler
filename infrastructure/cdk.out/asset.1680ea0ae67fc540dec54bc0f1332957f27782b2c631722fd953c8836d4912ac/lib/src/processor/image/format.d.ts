import { IImageContext } from '.';
import { IActionOpts, ReadOnly, IProcessContext } from '..';
import { BaseImageAction } from './_base';
export interface FormatOpts extends IActionOpts {
    format: string;
}
export declare class FormatAction extends BaseImageAction {
    readonly name: string;
    beforeNewContext(ctx: IProcessContext, params: string[]): void;
    beforeProcess(ctx: IImageContext, params: string[], index: number): void;
    validate(params: string[]): ReadOnly<FormatOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
