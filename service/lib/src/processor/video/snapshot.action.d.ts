import { IAction, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';
export interface VideoSnapshotOpts extends IActionOpts {
    t: number;
    f: string;
    m: string;
    o: string;
}
export declare class SnapshotAction implements IAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<VideoSnapshotOpts>;
    process(ctx: IExtendedProcessContext, params: string[]): Promise<void>;
    beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
    beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
    private videoScreenShot;
}
