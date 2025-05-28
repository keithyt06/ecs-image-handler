/// <reference types="node" />
import { LRUCache } from 'lru-cache';
import * as sharp from 'sharp';
export interface ISharpInfo {
    cache: sharp.CacheResult;
    simd: boolean;
    counters: sharp.SharpCounters;
    concurrency: number;
    versions: {
        vips: string;
        cairo?: string;
        croco?: string;
        exif?: string;
        expat?: string;
        ffi?: string;
        fontconfig?: string;
        freetype?: string;
        gdkpixbuf?: string;
        gif?: string;
        glib?: string;
        gsf?: string;
        harfbuzz?: string;
        jpeg?: string;
        lcms?: string;
        orc?: string;
        pango?: string;
        pixman?: string;
        png?: string;
        svg?: string;
        tiff?: string;
        webp?: string;
        avif?: string;
        heif?: string;
        xml?: string;
        zlib?: string;
    };
}
export interface IDebugInfo {
    os: {
        arch: string;
        cpus: number;
        loadavg: number[];
    };
    memory: {
        stats: string;
        free: number;
        total: number;
        usage: NodeJS.MemoryUsage;
    };
    resource: {
        usage: NodeJS.ResourceUsage;
    };
    lruCache?: {
        keys: number;
        sizeMB: number;
        ttlSec: number;
    };
    sharp: ISharpInfo;
}
export default function debug(lruCache?: LRUCache<string, CacheObject>): IDebugInfo;
