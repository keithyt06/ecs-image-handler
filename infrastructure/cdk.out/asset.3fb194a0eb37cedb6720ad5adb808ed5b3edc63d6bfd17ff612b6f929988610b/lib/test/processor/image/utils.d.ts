import { IImageContext } from '../../../src/processor/image';
import { IBufferStore, LocalStore } from '../../../src/store';
export declare const fixtureStore: LocalStore;
export declare function mkctx(name: string, actions?: string[], bufferStore?: IBufferStore): Promise<IImageContext>;
