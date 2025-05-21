import * as path from 'path';
import { ParsedUrlQuery } from 'querystring';
import config from './config';
import { InvalidArgument, IProcessor } from './processor';
import { ImageProcessor } from './processor/image';
import { StyleProcessor } from './processor/style';
import { VideoProcessor } from './processor/video';
import { IBufferStore, S3Store, LocalStore, MemKVStore, DynamoDBStore, IKVStore } from './store';
import * as style from './style.json';

const PROCESSOR_MAP: { [key: string]: IProcessor } = {
  [ImageProcessor.getInstance().name]: ImageProcessor.getInstance(),
  [StyleProcessor.getInstance().name]: StyleProcessor.getInstance(kvstore()),
  [VideoProcessor.getInstance().name]: VideoProcessor.getInstance(),
};

export function setMaxGifSizeMB(value: number) {
  ImageProcessor.getInstance().setMaxGifSizeMB(value);
}

export function setMaxGifPages(value: number) {
  ImageProcessor.getInstance().setMaxGifPages(value);
}

export function getProcessor(name: string): IProcessor {
  const processor = PROCESSOR_MAP[name];
  if (!processor) {
    throw new InvalidArgument('Can Not find processor');
  }
  return processor;
}

export function bufferStore(p?: string): IBufferStore {
  if (config.isProd) {
    if (!p) { p = config.srcBucket; }
    console.log(`use ${S3Store.name} s3://${p}`);
    return new S3Store(p);
  } else {
    if (!p) { p = path.join(__dirname, '../test/fixtures'); }
    console.log(`use ${LocalStore.name} file://${p}`);
    return new LocalStore(p);
  }
}

// Get a map of all configured S3 bucket stores
export function getBufferStores(): Map<string, IBufferStore> {
  const stores = new Map<string, IBufferStore>();
  
  if (config.isProd) {
    // Add all configured buckets to the map
    for (const bucket of config.srcBuckets) {
      stores.set(bucket, new S3Store(bucket));
    }
    console.log(`Initialized ${stores.size} S3 bucket stores: ${Array.from(stores.keys()).join(', ')}`);
  } else {
    // For local development, use a single local store
    const localPath = path.join(__dirname, '../test/fixtures');
    stores.set('default', new LocalStore(localPath));
    console.log(`use ${LocalStore.name} file://${localPath}`);
  }
  
  return stores;
}

export function kvstore(): IKVStore {
  if (config.isProd) {
    console.log(`use ${DynamoDBStore.name}`);
    return new DynamoDBStore(config.styleTableName);
  } else {
    console.log(`use ${MemKVStore.name}`);
    return new MemKVStore(style);
  }
}

// 处理新的im参数格式
function processImParam(imParam: string): string[] {
  const params = imParam.split(',');
  const result: string[] = ['image'];
  
  // 提取Resize参数
  if (params[0] === 'Resize') {
    const resizeParams = ['resize'];
    let width, height, format, quality;
    
    // 处理所有参数
    for (let i = 1; i < params.length; i++) {
      const param = params[i];
      if (param.startsWith('width=')) {
        width = param.substring(6);
        resizeParams.push(`w_${width}`);
      } else if (param.startsWith('height=')) {
        height = param.substring(7);
        resizeParams.push(`h_${height}`);
      } else if (param.startsWith('format=')) {
        format = param.substring(7);
      } else if (param.startsWith('quality=')) {
        quality = param.substring(8);
      }
    }
    
    // 添加m_fixed参数确保宽高参数一定生效
    resizeParams.push('m_fixed');
    
    result.push(resizeParams.join(','));
    
    // 添加格式处理
    if (format) {
      result.push(`format,${format}`);
    }
    
    // 添加质量处理
    if (quality) {
      result.push(`quality,q_${quality}`);
    }
  }
  
  return result;
}

export function parseRequest(uri: string, query: ParsedUrlQuery): { uri: string; actions: string[] } {
  uri = uri.replace(/^\//, ''); // trim leading slash "/"
  
  // 处理新格式请求
  if (query['im']) {
    const imParam = query['im'] as string;
    return {
      uri: uri,
      actions: processImParam(imParam)
    };
  }
  
  // 处理原有格式请求
  const parts = uri.split(/@?!/, 2);
  if (parts.length === 1) {
    const x_oss_process = (query['x-oss-process'] as string) ?? '';
    return {
      uri: uri,
      actions: x_oss_process.split('/').filter(x => x),
    };
  }
  
  // 处理样式请求
  const stylename = (parts[1] ?? '').trim();
  if (!stylename) {
    throw new InvalidArgument('Empty style name');
  }
  return {
    uri: parts[0],
    actions: ['style', stylename],
  };
}
