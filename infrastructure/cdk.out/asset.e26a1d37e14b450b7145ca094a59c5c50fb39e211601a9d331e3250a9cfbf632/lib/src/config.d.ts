export interface IConfig {
    port: number;
    region: string;
    isProd: boolean;
    srcBucket: string;
    srcBuckets: string[];
    styleTableName: string;
    autoWebp: boolean;
    autoAvif: boolean;
    secretName: string;
    sharpQueueLimit: number;
    configJsonParameterName: string;
    CACHE_TTL_SEC: number;
    CACHE_MAX_ITEMS: number;
    CACHE_MAX_SIZE_MB: number;
}
declare const conf: IConfig;
export default conf;
