import { IAction, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';
/**
 * 视频压缩选项接口
 */
export interface VideoCompressOpts extends IActionOpts {
    q: number;
    r: number;
    s: string;
    br: number;
    fmt: string;
    preset: string;
}
export declare class CompressAction implements IAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<VideoCompressOpts>;
    process(ctx: IExtendedProcessContext, params: string[]): Promise<void>;
    private buildFFmpegArgs;
    private getContentType;
    private executeFFmpeg;
    beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
    beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
}
