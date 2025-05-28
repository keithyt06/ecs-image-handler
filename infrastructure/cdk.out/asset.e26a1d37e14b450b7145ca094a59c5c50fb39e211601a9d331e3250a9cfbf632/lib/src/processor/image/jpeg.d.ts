export function decode(jpegData: any, userOpts?: {}): JpegImage;
declare class JpegImage {
    static totalBytesAllocated: number;
    static maxMemoryUsageBytes: number;
    static requestMemoryAllocation(increaseAmount?: number): void;
    static resetMaxMemoryUsage(maxMemoryUsageBytes_: any): void;
    static getBytesAllocated(): number;
    opts: {};
    quality: number;
    parse(data: any): void;
    comments: any[] | undefined;
    exifBuffer: any;
    width: any;
    height: any;
    jfif: {
        version: {
            major: any;
            minor: any;
        };
        densityUnits: any;
        xDensity: number;
        yDensity: number;
        thumbWidth: any;
        thumbHeight: any;
        thumbData: any;
    } | null | undefined;
    adobe: {
        version: any;
        flags0: number;
        flags1: number;
        transformCode: any;
    } | null | undefined;
    components: any[] | undefined;
}
export {};
