import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface ContrastOpts extends IActionOpts {
    contrast: number;
}
export declare class ContrastAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<ContrastOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
