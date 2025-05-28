import * as sharp from 'sharp';
import { IAction, IProcessContext, IProcessor, IProcessResponse } from '../../processor';
import { IBufferStore } from '../../store';
export interface IImageInfo {
    [key: string]: {
        value: string;
    };
}
export interface IImageContext extends IProcessContext {
    image: sharp.Sharp;
    metadata: sharp.Metadata;
    info?: IImageInfo;
}
export declare class ImageProcessor implements IProcessor {
    static getInstance(): ImageProcessor;
    private static _instance;
    private readonly _actions;
    private _maxGifSizeMB;
    private _maxGifPages;
    readonly name: string;
    private constructor();
    setMaxGifSizeMB(value: number): void;
    setMaxGifPages(value: number): void;
    newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IImageContext>;
    process(ctx: IImageContext): Promise<IProcessResponse>;
    action(name: string): IAction;
    register(...actions: IAction[]): void;
}
