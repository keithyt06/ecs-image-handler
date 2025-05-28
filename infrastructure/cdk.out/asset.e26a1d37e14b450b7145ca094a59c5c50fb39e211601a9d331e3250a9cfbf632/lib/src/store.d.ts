/// <reference types="node" />
import * as sharp from 'sharp';
import { IHttpHeaders } from './processor';
/**
 * A abstract store to get file data.
 * It can either get from s3 or local filesystem.
 */
export interface IStore<T> {
    /**
     * Read all buffer from underlying.
     * Return both the buffer and the s3 object/file type.
     * Usually the file type is the file's suffix.
     *
     * @param p the path of the s3 object or the file
     * @param beforeGetFunc a hook function that will be executed before get
     */
    get(p: string, beforeGetFunc?: () => void): Promise<T>;
    url(p: string): Promise<string>;
}
export interface IKeyValue {
    [key: string]: any;
}
export interface IBufferStore extends IStore<{
    buffer: Buffer;
    type: string;
    headers: IHttpHeaders;
}> {
}
export interface IKVStore extends IStore<IKeyValue> {
}
/**
 * A local file system based store.
 */
export declare class LocalStore implements IBufferStore {
    private root;
    constructor(root?: string);
    get(p: string, _?: () => void): Promise<{
        buffer: Buffer;
        type: string;
        headers: IHttpHeaders;
    }>;
    url(p: string): Promise<string>;
}
/**
 * S3 based store.
 */
export declare class S3Store implements IBufferStore {
    readonly bucket: string;
    private _s3;
    constructor(bucket: string);
    get(p: string, beforeGetFunc?: () => void): Promise<{
        buffer: Buffer;
        type: string;
        headers: IHttpHeaders;
    }>;
    url(p: string): Promise<string>;
}
/**
 * A fake store. Only for unit test.
 */
export declare class NullStore implements IBufferStore {
    url(_: string): Promise<string>;
    get(p: string, _?: () => void): Promise<{
        buffer: Buffer;
        type: string;
        headers: IHttpHeaders;
    }>;
}
/**
 * A sharp image store. Only for unit test.
 */
export declare class SharpBufferStore implements IBufferStore {
    private image;
    constructor(image: sharp.Sharp);
    url(_: string): Promise<string>;
    get(_: string, __?: () => void): Promise<{
        buffer: Buffer;
        type: string;
        headers: IHttpHeaders;
    }>;
}
export declare class DynamoDBStore implements IKVStore {
    readonly tableName: string;
    private _ddb;
    constructor(tableName: string);
    url(_: string): Promise<string>;
    get(key: string, _?: () => void): Promise<IKeyValue>;
}
export declare class MemKVStore implements IKVStore {
    readonly dict: IKeyValue;
    constructor(dict: IKeyValue);
    url(_: string): Promise<string>;
    get(key: string, _?: () => void): Promise<IKeyValue>;
}
