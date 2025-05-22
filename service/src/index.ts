import * as S3 from 'aws-sdk/clients/s3';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import * as SSM from 'aws-sdk/clients/ssm';
import * as HttpErrors from 'http-errors';
import * as Koa from 'koa'; // http://koajs.cn
import * as bodyParser from 'koa-bodyparser';
// import * as koaCash from 'koa-cash'; // 未使用，已禁用缓存功能
import * as logger from 'koa-logger';
import * as Router from 'koa-router';
// import { LRUCache } from 'lru-cache'; // Removed LRUCache import
import * as sharp from 'sharp';
import config from './config';
import debug from './debug';
import { bufferStore, getBufferStores, getProcessor, parseRequest, setMaxGifSizeMB, setMaxGifPages } from './default';
import * as is from './is';
import { IHttpHeaders } from './processor';
import { IBufferStore } from './store';

const ssm = new SSM({ region: config.region });
const smclient = new SecretsManager({ region: config.region });

// Initialize buffer stores for all configured buckets
const bufferStores = getBufferStores();
const DefaultBufferStore = bufferStore();

const app = new Koa();
const router = new Router();
// const lruCache = new LRUCache<string, CacheObject>({ // Commented out lruCache
//   max: config.CACHE_MAX_ITEMS,
//   maxSize: config.CACHE_MAX_SIZE_MB * MB,
//   ttl: config.CACHE_TTL_SEC * 1000,
//   sizeCalculation: (value) => {
//     return value.body.length;
//   },
// });

// 优化Sharp缓存设置以提高性能
// items: 增加到3000，允许缓存更多处理过的图像
// files: 增加到500，允许缓存更多文件描述符
// memory: 增加到4000MB，提高大图像处理性能
sharp.cache({ items: 3000, files: 500, memory: 4000 });

// 设置Sharp并发处理限制，防止内存溢出
sharp.concurrency(4);

// 启用Sharp统计，帮助监控性能
sharp.simd(true);

app.use(logger());
app.use(errorHandler());
app.use(bodyParser());
// 禁用缓存功能，确保根据Accept头动态生成图片格式
// app.use(koaCash({
//   setCachedHeader: true,
//   hash(ctx) {
//     return ctx.headers['x-bucket'] + ctx.request.url;
//   },
//   get: (key) => {
//     return Promise.resolve(lruCache.get(key));
//   },
//   set: (key, value) => {
//     lruCache.set(key, value as CacheObject);
//     return Promise.resolve();
//   },
// }));

router.post('/images', async (ctx: Koa.ParameterizedContext) => {
  console.log('post request body=', ctx.request.body);

  const opt = await validatePostRequest(ctx);
  ctx.path = opt.sourceObject;
  ctx.query['x-oss-process'] = opt.params;
  ctx.headers['x-bucket'] = opt.sourceBucket;

  const { data, type } = await ossprocess(ctx);
  if (type !== 'application/json') {
    // TODO: Do we need to abstract this with IBufferStore?
    const _s3: S3 = new S3({ region: config.region });
    await _s3.putObject({
      Bucket: opt.targetBucket,
      Key: opt.targetObject,
      ContentType: type,
      Body: data,
    }).promise();

    ctx.body = `saved result to s3://${opt.targetBucket}/${opt.targetObject}`;
  }
});

router.get(['/', '/ping'], async (ctx: Koa.ParameterizedContext) => {
  ctx.body = 'ok';

  try {
    await setMaxGifLimit();
  } catch (err: any) {
    console.error(err);
  }
});

router.get(['/debug', '/_debug'], async (ctx: Koa.ParameterizedContext) => {
  console.log(JSON.stringify(debug())); // Call debug without arguments
  ctx.status = 400;
  ctx.body = 'Please check your server logs for more details!';
});

router.get('/(.*)', async (ctx: Koa.ParameterizedContext) => {
  // 缓存功能已完全禁用
  
  const queue = sharp.counters().queue;
  if (queue > config.sharpQueueLimit) {
    ctx.body = { message: 'Too many requests, please try again later.' };
    ctx.status = 429;
    return;
  }
  const { data, type, headers } = await ossprocess(ctx, bypass);
  ctx.body = data;
  ctx.type = type;
  ctx.set(headers);
});

app.use(router.routes());
app.use(router.allowedMethods);

app.on('error', (err: Error) => {
  const msg = err.stack || err.toString();
  console.error(`\n${msg.replace(/^/gm, '  ')}\n`);
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log('Config:', JSON.stringify(config));
});

function errorHandler(): Koa.Middleware<Koa.DefaultState, Koa.DefaultContext, any> {
  return async (ctx: Koa.ParameterizedContext, next: Koa.Next) => {
    try {
      await next();
    } catch (err: any) {
      // ENOENT support
      if (err.code === 'ENOENT') {
        err.status = 404;
        err.message = 'NotFound';
      }
      ctx.status = err.statusCode || err.status || 500;
      ctx.body = {
        status: err.status,
        name: err.name,
        message: err.message,
      };

      ctx.app.emit('error', err, ctx);
    }
  };
}

function getBufferStore(ctx: Koa.ParameterizedContext): IBufferStore {
  const bucket = ctx.headers['x-bucket'];
  if (bucket && typeof bucket === 'string') {
    // Check if we have a store for this bucket
    const store = bufferStores.get(bucket);
    if (store) {
      return store;
    }
    
    // If the bucket is not in our pre-configured list but is specified in the request,
    // create a new store for it (this allows dynamic bucket access)
    const newStore = bufferStore(bucket);
    bufferStores.set(bucket, newStore);
    return newStore;
  }
  return DefaultBufferStore;
}

// 根据Accept头获取最优格式
function getOptimalFormat(acceptHeader: string): string {
  if (!acceptHeader) {
    return ''; // 使用原始格式
  }
  
  // 解析Accept头，进行更精确的MIME类型匹配
  // 示例: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
  const formats = acceptHeader.split(',').map(f => f.trim().toLowerCase());
  
  // 扩展MIME类型与格式映射
  const mimeToFormat: {[key: string]: string} = {
    'image/avif': 'avif',
    'image/webp': 'webp',
    'image/png': 'png', 
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/apng': 'png',
    'image/gif': 'gif',
    'image/svg+xml': 'svg'
  };
  
  // 计算质量因子 (q值)，默认为1.0
  function getQuality(format: string): number {
    // 提取分号后的参数部分
    const params = format.split(';').slice(1);
    // 查找q参数
    for (const param of params) {
      const qMatch = param.trim().match(/^q=([0-9.]+)$/);
      if (qMatch) return parseFloat(qMatch[1]);
    }
    return 1.0; // 默认质量因子
  }
  
  // 创建格式优先级映射，按照我们期望的优先级排序
  const formatPriority: {[key: string]: number} = {
    'avif': 100,
    'webp': 90,
    'png': 70,
    'jpeg': 60,
    'gif': 50,
    'svg': 40
  };
  
  // 收集所有格式及其质量因子和优先级
  const formatPreferences: {format: string, quality: number, priority: number}[] = [];
  
  for (const formatString of formats) {
    // 如果是通配符，跳过
    if (formatString.includes('*/*')) continue;
    
    // 获取基本MIME类型
    const baseMime = formatString.split(';')[0].trim();
    const format = mimeToFormat[baseMime];
    
    // 如果是我们支持的图像格式
    if (format) {
      const quality = getQuality(formatString);
      const priority = formatPriority[format] || 0;
      
      // 添加到偏好列表
      formatPreferences.push({
        format,
        quality,
        priority
      });
    }
  }
  
  // 对格式按优先级和质量排序
  formatPreferences.sort((a, b) => {
    // 首先按优先级排序
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // 然后按质量排序
    return b.quality - a.quality;
  });
  
  // 返回最佳格式，如果没有匹配则返回空字符串
  if (formatPreferences.length > 0) {
    // 记录所有格式偏好用于调试
    console.log(`格式偏好列表: ${JSON.stringify(formatPreferences)}`);
    
    // 将AVIF质量因子阈值降低，允许更多AVIF使用案例
    if (formatPreferences[0].format === 'avif' && formatPreferences[0].quality < 0.3) {
      console.log(`AVIF质量因子太低 (${formatPreferences[0].quality})，降级到WebP`);
      // 查找第二优先级的格式
      for (const pref of formatPreferences) {
        if (pref.format === 'webp') {
          console.log(`降级选择WebP格式，质量因子: ${pref.quality}`);
          return 'webp';
        }
      }
    }
    
    // 如果AVIF质量因子足够，或者最高优先级不是AVIF
    console.log(`选择最优格式: ${formatPreferences[0].format}，质量因子: ${formatPreferences[0].quality}`);
    return formatPreferences[0].format;
  }
  
  return ''; // 默认使用原始格式
}

async function ossprocess(ctx: Koa.ParameterizedContext, beforeGetFn?: () => void):
Promise<{ data: any; type: string; headers: IHttpHeaders }> {
  const { uri, actions } = parseRequest(ctx.path, ctx.query);
  
  // 检查是否已指定format操作
  let hasFormat = false;
  let hasQuality = false;
  let hasResize = false;
  
  for (const action of actions) {
    const params = action.split(',');
    if (params[0] === 'format') {
      hasFormat = true;
    } else if (params[0] === 'quality') {
      hasQuality = true;
    } else if (params[0] === 'resize') {
      hasResize = true;
    }
  }
  
  // 添加Accept头处理 - 尝试多种方式获取Accept头
  const acceptHeader = ctx.get('Accept') || 
                      ctx.request.headers['accept'] || 
                      ctx.headers['accept'] || 
                      '';
                      
  // 记录完整的请求头用于调试
  console.log(`请求的所有头: ${JSON.stringify(ctx.headers)}`);
  console.log(`请求的Accept头: ${acceptHeader}`);
  
  // 获取最佳格式
  const optimalFormat = getOptimalFormat(acceptHeader);
  console.log(`基于Accept头选择的最佳格式: ${optimalFormat || '无'}`);
  
  // 如果有resize操作 或 其他任何操作，添加format和quality
  if (actions.length > 0 && (hasResize || actions.length > 1)) {
    // 如果没有指定format且有最优格式，添加format操作
    if (!hasFormat && optimalFormat) {
      actions.push(`format,${optimalFormat}`);
      console.log(`基于Accept头添加format操作: ${optimalFormat}`);
    }
    
    // 如果没有指定quality，添加默认质量参数
    if (!hasQuality) {
      let defaultQualityValue: number;
      // 确定目标格式以选择默认质量
      let targetFormatForQuality = optimalFormat; // 默认为Accept头选出的最优格式
      if (hasFormat) { // 如果请求中明确指定了format，则以其为准
        for (const action of actions) {
          if (action.startsWith('format,')) {
            targetFormatForQuality = action.split(',')[1];
            break;
          }
        }
      }

      // 根据目标格式从config中获取默认质量
      switch (targetFormatForQuality) {
        case 'avif':
          defaultQualityValue = config.defaultQuality.avif;
          break;
        case 'webp':
          defaultQualityValue = config.defaultQuality.webp;
          break;
        case 'jpeg':
        case 'jpg':
          defaultQualityValue = config.defaultQuality.jpeg;
          break;
        case 'png':
          // 确保 config.defaultQuality 中有 png 属性
          defaultQualityValue = config.defaultQuality.png !== undefined ? config.defaultQuality.png : 90; // Fallback if not in config
          break;
        default:
          // 对于其他未明确处理的格式或无格式转换的情况
          // 可以选择一个通用回退值，例如JPEG的默认质量
          // 或者，如果不希望为未知格式添加quality动作，这里可以不操作
          defaultQualityValue = config.defaultQuality.jpeg; // 使用JPEG作为通用回退
          console.log(`未找到 ${targetFormatForQuality} 的特定默认质量，使用JPEG默认值: ${defaultQualityValue}`);
      }
      
      actions.push(`quality,q_${defaultQualityValue}`);
      console.log(`已注入默认质量参数 quality,q_${defaultQualityValue} 针对于格式 ${targetFormatForQuality || '原始格式'}`);
    }
  }
  
  // 只通过 x-bucket 头选择存储桶，不再解析路径
  const bs = getBufferStore(ctx);
  if (actions.length > 1) {
    const processor = getProcessor(actions[0]);
    const context = await processor.newContext(uri, actions, bs);
    const { data, type } = await processor.process(context);
    
    // 确保设置正确的Content-Type和额外头信息
    const headers: IHttpHeaders = {
      ...context.headers,
      'Content-Type': getMimeType(type),
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    };
    
    return { data, type, headers };
  } else {
    // 获取原图，只使用originalType，避免未使用变量警告
    const { type: originalType } = await bs.get(uri, beforeGetFn);
    
    // 使用之前获取的acceptHeader，避免重复获取
    console.log(`原图处理: 尝试应用Accept头优化，原始格式: ${originalType}`);
    
    // 始终为原图应用格式转换，确保基于Accept头返回最佳格式
    console.log(`对原图进行格式转换: ${originalType} -> ${optimalFormat || 'jpeg'}`);
    
    // 创建临时处理链
    const tempActions = [];
    
    // 添加格式转换动作
    const targetFormat = optimalFormat || 'jpeg'; // 如果Accept头没有，则默认为jpeg
    tempActions.push(`format,${targetFormat}`);
    
    // 为原图转换添加质量参数，同样从config读取
    let defaultQualityForOriginal: number;
    switch (targetFormat) {
      case 'avif':
        defaultQualityForOriginal = config.defaultQuality.avif;
        break;
      case 'webp':
        defaultQualityForOriginal = config.defaultQuality.webp;
        break;
      case 'jpeg':
      case 'jpg':
        defaultQualityForOriginal = config.defaultQuality.jpeg;
        break;
      case 'png':
        defaultQualityForOriginal = config.defaultQuality.png !== undefined ? config.defaultQuality.png : 90; // Fallback
        break;
      default:
        defaultQualityForOriginal = config.defaultQuality.jpeg; // Fallback
    }
    tempActions.push(`quality,q_${defaultQualityForOriginal}`);
    console.log(`原图处理：已注入默认质量 quality,q_${defaultQualityForOriginal} 针对于转换格式 ${targetFormat}`);
    
    // 使用主处理器处理图像
    const processor = getProcessor('image');
    const context = await processor.newContext(uri, tempActions, bs);
    const { data, type } = await processor.process(context);
    
    // 确保设置正确的Content-Type和额外头信息
    const enhancedHeaders: IHttpHeaders = {
      ...context.headers,
      'Content-Type': getMimeType(type),
      'Content-Disposition': 'inline', // 明确指示浏览器显示而非下载
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept' // 允许基于Accept头的缓存变化
    };
    
    return { data, type, headers: enhancedHeaders };
  }
}

// 确保返回正确的MIME类型
function getMimeType(type: string): string {
  // 规范化类型字符串
  const normalizedType = type.toLowerCase();
  
  // 处理常见图像格式
  if (normalizedType === 'jpeg' || normalizedType === 'jpg') return 'image/jpeg';
  if (normalizedType === 'png') return 'image/png';
  if (normalizedType === 'webp') return 'image/webp';
  if (normalizedType === 'avif') return 'image/avif';
  if (normalizedType === 'gif') return 'image/gif';
  if (normalizedType === 'tiff' || normalizedType === 'tif') return 'image/tiff';
  if (normalizedType === 'svg') return 'image/svg+xml';
  
  // HEIF/HEIC格式强制转换为JPEG，因为浏览器支持有限
  if (normalizedType === 'heif' || normalizedType === 'heic') return 'image/jpeg';
  
  // 如果已经是完整的MIME类型，检查是否为HEIF/HEIC
  if (normalizedType.includes('/')) {
    if (normalizedType.includes('heif') || normalizedType.includes('heic')) {
      console.log(`检测到HEIF/HEIC格式，转换为JPEG: ${normalizedType}`);
      return 'image/jpeg';
    }
    return normalizedType;
  }
  
  // 默认返回JPEG类型，确保浏览器兼容性
  console.log(`未知图像格式 ${normalizedType}，默认设置为JPEG`);
  return 'image/jpeg';
}

async function validatePostRequest(ctx: Koa.ParameterizedContext) {
  // Fox edited in 2022/04/25: enhance the security of the post requests
  const authHeader = ctx.get('X-Client-Authorization');
  const secretHeader = await getHeaderFromSecretsManager();

  if (authHeader !== secretHeader) {
    throw new HttpErrors[400]('Invalid post header.');
  }

  const body = ctx.request.body;
  if (!body) {
    throw new HttpErrors[400]('Empty post body.');
  }
  const valid = body.params
    && body.sourceBucket
    && body.sourceObject
    && body.targetBucket
    && body.targetObject;
  if (!valid) {
    throw new HttpErrors[400]('Invalid post body.');
  }
  return {
    params: body.params,
    sourceBucket: body.sourceBucket,
    sourceObject: body.sourceObject,
    targetBucket: body.targetBucket,
    targetObject: body.targetObject,
  };
}

function bypass() {
  // 允许直接访问原图，不再抛出异常
  // 旧代码：throw new HttpErrors.Forbidden('Please visit s3 directly');
  return;
}

async function getSecretFromSecretsManager() {
  // Load the AWS SDK
  const secretName = config.secretName;
  return smclient.getSecretValue({ SecretId: secretName }).promise();
}

async function getHeaderFromSecretsManager() {
  const secret = await getSecretFromSecretsManager();
  const secretString = secret.SecretString!;
  const keypair = JSON.parse(secretString);
  return keypair['X-Client-Authorization'];
}

async function setMaxGifLimit() {
  if (config.configJsonParameterName) {
    const data = await ssm.getParameter({ Name: config.configJsonParameterName }).promise();
    if (data.Parameter) {
      const configJson = JSON.parse(data.Parameter.Value ?? '{}');
      const maxGifSizeMB = configJson.max_gif_size_mb;
      if (is.number(maxGifSizeMB)) {
        setMaxGifSizeMB(maxGifSizeMB);
      }
      const maxGifPages = configJson.max_gif_pages;
      if (is.number(maxGifPages)) {
        setMaxGifPages(maxGifPages);
      }
    }
  }
}
