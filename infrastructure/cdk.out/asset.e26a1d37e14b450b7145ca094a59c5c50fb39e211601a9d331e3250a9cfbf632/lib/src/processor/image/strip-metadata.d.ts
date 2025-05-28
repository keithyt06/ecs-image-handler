import { ReadOnly, IActionOpts, IProcessContext } from '..';
import { BaseImageAction } from './_base';
export declare class StripMetadataAction extends BaseImageAction {
    readonly name: string;
    validate(_: string[]): ReadOnly<IActionOpts>;
    process(_1: IProcessContext, _2: string[]): Promise<void>;
}
