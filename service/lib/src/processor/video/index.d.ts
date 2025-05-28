import { IAction, IProcessContext, IProcessor, IProcessResponse } from '..';
import { IBufferStore } from '../../store';
export * from './context';
export * from './snapshot.action';
export * from './compress.action';
export * from './transcode.action';
/**
 * 视频处理器 - 支持截图、转码、压缩等操作
 */
export declare class VideoProcessor implements IProcessor {
    static getInstance(): VideoProcessor;
    private static _instance;
    private actions;
    readonly name: string;
    private constructor();
    register(...actions: IAction[]): void;
    newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IProcessContext>;
    process(ctx: IProcessContext): Promise<IProcessResponse>;
}
