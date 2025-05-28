import { IImageContext } from '.';
import { IActionOpts, ReadOnly } from '..';
import { BaseImageAction } from './_base';
export interface CropOpts extends IActionOpts {
    w: number;
    h: number;
    x: number;
    y: number;
    g: 'nw' | 'north' | 'ne' | 'west' | 'center' | 'east' | 'sw' | 'south' | 'se';
}
export declare class CropAction extends BaseImageAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<CropOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
}
