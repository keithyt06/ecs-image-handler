import { IActionOpts, ReadOnly, IProcessContext } from '..';
import { BaseImageAction } from './_base';
export interface CgifOpts extends IActionOpts {
    s?: number;
}
export declare class CgifAction extends BaseImageAction {
    readonly name: string;
    beforeNewContext(ctx: IProcessContext, params: string[]): void;
    validate(): ReadOnly<CgifOpts>;
    process(): Promise<void>;
}
