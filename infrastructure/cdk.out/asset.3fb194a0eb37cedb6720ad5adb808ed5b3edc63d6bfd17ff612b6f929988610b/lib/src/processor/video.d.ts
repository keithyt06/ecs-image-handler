import { IAction, IProcessContext, IProcessor, IProcessResponse, IActionOpts, ReadOnly } from '.';
import { IBufferStore } from '../store';
export interface VideoOpts extends IActionOpts {
    t: number;
    f: string;
    m: string;
    o: string;
}
export declare class VideoProcessor implements IProcessor {
    static getInstance(): VideoProcessor;
    private static _instance;
    readonly name: string;
    private constructor();
    newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IProcessContext>;
    validate(params: string[]): ReadOnly<VideoOpts>;
    process(ctx: IProcessContext): Promise<IProcessResponse>;
    register(..._: IAction[]): void;
}
