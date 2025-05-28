import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface QualityOpts extends IActionOpts {
    q?: number;
    Q?: number;
}
export declare class QualityAction extends BaseImageAction {
    readonly name: string;
    beforeProcess(ctx: IImageContext, _2: string[], index: number): void;
    validate(params: string[]): ReadOnly<QualityOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
