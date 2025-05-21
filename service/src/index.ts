import * as S3 from 'aws-sdk/clients/s3';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import * as SSM from 'aws-sdk/clients/ssm';
// import * as HttpErrors from 'http-errors'; // 未使用，已注释
import * as Koa from 'koa'; // http://koajs.cn
import * as bodyParser from 'koa-bodyparser';
// import * as koaCash from 'koa-cash'; // 未使用，已禁用缓存功能
import * as logger from 'koa-logger';
import * as Router from 'koa-router';
import { LRUCache } from 'lru-cache';
import * as sharp from 'sharp';
import config from './config';
import debug from './debug';
import { bufferStore, getBufferStores, getProcessor, parseRequest, setMaxGifSizeMB, setMaxGifPages } from './default';
import * as is from './is';
import { IHttpHeaders, InvalidArgument } from './processor';
import { IBufferStore } from './store';

const MB = 1048576;

const ssm = new SSM({ region: config.region });
const smclient = new SecretsManager({ region: config.region });

// Initialize buffer stores for all configured buckets
const bufferStores = getBufferStores();
const DefaultBufferStore = bufferStore();

const app = new Koa();
const router = new Router();
const lruCache = new LRUCache<string, CacheObject>({
  max: config.CACHE_MAX_ITEMS,
  maxSize: config.CACHE_MAX_SIZE_MB * MB,
  ttl: config.CACHE_TTL_SEC * 1000,
  sizeCalculation: (value) => {
    return value.body.length;
  },
});

sharp.cache({ items: 1000, files: 200, memory: 2000 });

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

router.post('/images', async (ctx) => {
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

router.get(['/', '/ping'], async (ctx) => {
  ctx.body = 'ok';

  try {
    await setMaxGifLimit();
  } catch (err: any) {
    console.error(err);
  }
});

router.get(['/debug', '/_debug'], async (ctx) => {
  console.log(JSON.stringify(debug(lruCache)));
  ctx.status = 400;
  ctx.body = 'Please check your server logs for more details!';
});

router.get('/(.*)', async (ctx) => {
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
  return async (ctx, next) => {
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
  const formats = acceptHeader.split(',').map(f => f.trim().toLowerCase());
  
  // 按优先级检查支持的格式（avif > webp > 原图）
  if (formats.some(f => f.includes('image/avif'))) {
    return 'avif';
  } else if (formats.some(f => f.includes('image/webp'))) {
    return 'webp';
  }
  
  // 检查其他常见格式
  if (formats.some(f => f.includes('image/png'))) {
    return 'png';
  } else if (formats.some(f => f.includes('image/jpeg') || f.includes('image/jpg'))) {
    return 'jpeg';
  }
  
  return ''; // 默认使用原始格式
}

async function ossprocess(ctx: Koa.ParameterizedContext, beforeGetFn?: () => void):
Promise<{ data: any; type: string; headers: IHttpHeaders }> {
  const { uri, actions } = parseRequest(ctx.path, ctx.query);
  
  // 添加Accept头处理
  const acceptHeader = ctx.get('Accept');
  const optimalFormat = getOptimalFormat(acceptHeader);
  
  // 检查是否已指定format操作
  let hasFormat = false;
  for (const action of actions) {
    const params = action.split(',');
    if (params[0] === 'format') {
      hasFormat = true;
      break;
    }
  }
  
  // 如果没有指定format且有最优格式，添加format操作
  // 只有在有其他操作时（例如resize）才添加format操作，保留原图访问能力
  if (!hasFormat && optimalFormat && actions.length > 0) {
    actions.push(`format,${optimalFormat}`);
    console.log(`基于Accept头添加format操作: ${optimalFormat}`);
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
    // 直接访问原图
    const { buffer, type, headers } = await bs.get(uri, beforeGetFn);
    
    // 确保原图也有正确的Content-Type和直接显示指令
    const enhancedHeaders: IHttpHeaders = {
      ...headers,
      'Content-Type': getMimeType(type),
      'Content-Disposition': 'inline', // 明确指示浏览器显示而非下载
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept' // 允许基于Accept头的缓存变化
    };
    
    // 检查文件扩展名，确保与实际内容类型匹配
    const fileExt = uri.split('.').pop()?.toLowerCase();
    if (fileExt && fileExt !== type.toLowerCase()) {
      console.log(`文件扩展名 ${fileExt} 与内容类型 ${type} 不匹配，设置正确的Content-Type: ${getMimeType(type)}`);
    }
    
    return { data: buffer, type, headers: enhancedHeaders };
  }
}

// 确保返回正确的MIME类型
function getMimeType(type: string): string {
  // 处理常见图像格式
  if (type === 'jpeg' || type === 'jpg') return 'image/jpeg';
  if (type === 'png') return 'image/png';
  if (type === 'webp') return 'image/webp';
  if (type === 'avif') return 'image/avif';
  if (type === 'gif') return 'image/gif';
  if (type === 'tiff' || type === 'tif') return 'image/tiff';
  if (type === 'svg') return 'image/svg+xml';
  
  // 如果已经是完整的MIME类型，直接返回
  if (type.includes('/')) return type;
  
  // 默认返回通用图像类型
  return `image/${type}`;
}

async function validatePostRequest(ctx: Koa.ParameterizedContext) {
  // Fox edited in 2022/04/25: enhance the security of the post requests
  const authHeader = ctx.get('X-Client-Authorization');
  const secretHeader = await getHeaderFromSecretsManager();

  if (authHeader !== secretHeader) {
    throw new InvalidArgument('Invalid post header.');
  }

  const body = ctx.request.body;
  if (!body) {
    throw new InvalidArgument('Empty post body.');
  }
  const valid = body.params
    && body.sourceBucket
    && body.sourceObject
    && body.targetBucket
    && body.targetObject;
  if (!valid) {
    throw new InvalidArgument('Invalid post body.');
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
