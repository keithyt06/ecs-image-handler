import * as sharp from 'sharp';
import { IImageContext } from '.';
import { IActionOpts, ReadOnly, IProcessContext } from '..';
import { BaseImageAction } from './_base';
export interface WatermarkOpts extends IActionOpts {
    text: string;
    t: number;
    g: string;
    fill: boolean;
    rotate: number;
    size: number;
    color: string;
    image: string;
    auto: boolean;
    x?: number;
    y?: number;
    voffset: number;
    order: number;
    interval: number;
    align: number;
    type: string;
    shadow: number;
    halo: string;
}
interface WatermarkPosOpts extends IActionOpts {
    x?: number;
    y?: number;
}
interface WatermarkMixedGravityOpts extends IActionOpts {
    imgGravity: string;
    textGravity: string;
}
export declare class WatermarkAction extends BaseImageAction {
    readonly name: string;
    beforeNewContext(ctx: IProcessContext, params: string[]): void;
    validate(params: string[]): ReadOnly<WatermarkOpts>;
    process(ctx: IImageContext, params: string[]): Promise<void>;
    textWaterMark(ctx: IImageContext, opt: WatermarkOpts): Promise<void>;
    imgWaterMark(ctx: IImageContext, opt: WatermarkOpts): Promise<void>;
    compositeImg(ctx: IImageContext, watermarkImg: sharp.Sharp, opt: WatermarkOpts, double_auto?: Boolean): Promise<void>;
    mixedWaterMark(ctx: IImageContext, opt: WatermarkOpts): Promise<void>;
    gravityConvert(param: string): string;
    textImg(opt: WatermarkOpts): Promise<sharp.Sharp>;
    calculateImgPos(opt: WatermarkOpts, metadata: sharp.Metadata, markMetadata: sharp.Metadata): WatermarkPosOpts;
    calculatePos(opt: WatermarkOpts, sourceW?: number, sourceH?: number, markW?: number, markH?: number): WatermarkPosOpts;
    calculateMixedGravity(opt: WatermarkOpts): WatermarkMixedGravityOpts;
    autoResize(ctx: IImageContext, mark: sharp.Sharp, opt: WatermarkOpts): Promise<sharp.Sharp>;
    extraImgOverlay(markImg: sharp.Sharp, opt: WatermarkOpts, pos?: WatermarkPosOpts): Promise<sharp.OverlayOptions>;
}
export {};
