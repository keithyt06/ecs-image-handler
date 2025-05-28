import { IAction, IActionOpts, ReadOnly } from '..';
import { IExtendedProcessContext } from './context';
/**
 * 视频转码选项接口
 */
export interface VideoTranscodeOpts extends IActionOpts {
    fmt: string;
    vcodec: string;
    acodec: string;
    abr: number;
    profile: string;
}
export declare class TranscodeAction implements IAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<VideoTranscodeOpts>;
    private validateCodecFormatCompatibility;
    process(ctx: IExtendedProcessContext, params: string[]): Promise<void>;
    private buildFFmpegArgs;
    private getContentType;
    private executeFFmpeg;
    beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
    beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
}
