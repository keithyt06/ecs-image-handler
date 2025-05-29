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
    maxduration?: number;
}
export declare class CompressAction implements IAction {
    readonly name: string;
    validate(params: string[]): ReadOnly<VideoCompressOpts>;
    /**
     * 使用ffprobe获取视频元数据
     * @param url 视频URL
     * @returns 包含时长、比特率等信息的元数据对象
     */
    private getVideoMetadata;
    /**
     * 自动调整处理选项，针对大型视频优化
     * @param opt 原处理选项
     * @param metadata 视频元数据
     * @returns 调整后的处理选项
     */
    private optimizeOptionsForLargeVideo;
    process(ctx: IExtendedProcessContext, params: string[]): Promise<void>;
    private buildFFmpegArgs;
    private getContentType;
    /**
     * 根据格式确定是否需要使用临时文件处理
     * @param format 视频格式
     * @returns 是否需要使用临时文件
     */
    private requiresTempFile;
    /**
     * 生成唯一的临时文件路径
     * @param format 文件格式
     * @returns 临时文件路径
     */
    private generateTempFilePath;
    /**
     * 使用临时文件执行FFmpeg命令
     * @param args FFmpeg参数
     * @param format 视频格式
     * @returns 处理后的视频数据
     */
    private executeWithTempFile;
    /**
     * 使用管道执行FFmpeg命令
     * @param args FFmpeg参数
     * @returns 处理后的视频数据
     */
    private executePipeProcess;
    /**
     * 根据格式选择合适的执行方式
     * @param args FFmpeg参数
     * @returns 处理后的视频数据
     */
    private executeFFmpeg;
    beforeNewContext(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
    beforeProcess(_ctx: IExtendedProcessContext, _params: string[], _index: number): void;
}
