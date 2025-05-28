import { IAction, IProcessContext, IProcessor, IProcessResponse } from '.';
import { IBufferStore, IKVStore } from '../store';
export declare class StyleProcessor implements IProcessor {
    static getInstance(kvstore?: IKVStore): StyleProcessor;
    private static _instance;
    readonly name: string;
    private _kvstore;
    private constructor();
    newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IProcessContext>;
    process(ctx: IProcessContext): Promise<IProcessResponse>;
    register(..._: IAction[]): void;
}
