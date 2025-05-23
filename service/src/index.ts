import * as S3 from 'aws-sdk/clients/s3';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import * as SSM from 'aws-sdk/clients/ssm';
import * as HttpErrors from 'http-errors';
import * as Koa from 'koa'; // http://koajs.cn
import * as bodyParser from 'koa-bodyparser';
import * as koaCash from 'koa-cash';
import * as logger from 'koa-logger';
import * as Router from 'koa-router';
import { LRUCache } from 'lru-cache';
import * as sharp from 'sharp';
import config from './config';
import debug from './debug';
import { bufferStore, getBufferStores, getProcessor, parseRequest, setMaxGifSizeMB, setMaxGifPages } from './default';
import * as is from './is';
import { IHttpHeaders, InvalidArgument, IProcessor } from './processor';
import { IBufferStore } from './store';

const MB = 1048576;

const ssm = new SSM({ region: config.region });
const smclient = new SecretsManager({ region: config.region });

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
app.use(koaCash({
  setCachedHeader: true,
  hash(ctx) {
    return ctx.headers['x-bucket'] + ctx.request.url;
  },
  get: (key) => {
    return Promise.resolve(lruCache.get(key));
  },
  set: (key, value) => {
    lruCache.set(key, value as CacheObject);
    return Promise.resolve();
  },
}));

router.post('/images', async (ctx) => {
  console.log('post request body=', ctx.request.body);

  const opt = await validatePostRequest(ctx);
  ctx.path = opt.sourceObject;
  ctx.query['x-oss-process'] = opt.params;
  ctx.headers['x-bucket'] = opt.sourceBucket;

  const { data, type } = await ossprocess(ctx);
  if (type !== 'application/json') {
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
  if (await ctx.cashed()) return;

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
    const store = bufferStores.get(bucket);
    if (store) return store;
    const newStore = bufferStore(bucket);
    bufferStores.set(bucket, newStore);
    return newStore;
  }
  return DefaultBufferStore;
}

function getDefaultQualityForFormat(format: string): number {
  switch (format.toLowerCase()) {
    case 'jpeg': case 'jpg': return 85;
    case 'webp': return 80;
    case 'avif': return 75;
    case 'png': return 90;
    default: return 80;
  }
}

async function ossprocess(ctx: Koa.ParameterizedContext, beforeGetFn?: () => void):
Promise<{ data: any; type: string; headers: IHttpHeaders }> {
  const { uri, actions: originalActions } = parseRequest(ctx.path, ctx.query);
  let actions = [...originalActions]; // Mutable copy for processing

  let processorName: string | undefined;
  let operationActions: string[] = [];

  if (actions.length > 0) {
    try {
      getProcessor(actions[0]); // Check if the first action is a processor name
      processorName = actions[0];
      operationActions = actions.slice(1);
    } catch (e) {
      // Not a processor name, or error in getProcessor. Assume 'image' processor for remaining actions.
      // This case handles x-oss-process=resize,w_100 (no explicit 'image/' prefix)
      processorName = getProcessor('image').name; // Default to image processor's actual name
      operationActions = [...actions];
    }
  } else if (config.allowDirectAccess) {
    // No actions and direct access is allowed - serve original image
    const bs = getBufferStore(ctx);
    const { buffer, type, headers } = await bs.get(uri, beforeGetFn);
    return { data: buffer, type: type, headers: headers };
  }
  
  // If no processor could be determined (e.g. actions was empty and direct access not allowed), this will be an issue.
  // However, parseRequest should typically return actions that lead to a processor or handle direct access.
  if (!processorName) {
    // This case should ideally not be reached if parseRequest is robust or direct access is handled.
    // If actions were empty and no direct access, it implies an invalid request or a need for default processing.
    // For safety, default to image processor if uri is present.    
    if (uri) { 
        console.log('ossprocess: No actions and no direct access, attempting to serve original via image processor path, but this might be unintended.');
        processorName = getProcessor('image').name;
        operationActions = []; // No specific operations
    } else {
        throw new InvalidArgument('Cannot determine processor and URI is also empty');
    }
  }
  
  const isStyleProcessor = processorName === getProcessor('style').name;
  const hasActualOperations = operationActions.length > 0;

  // Inject format and quality if it's not a style processor and there are operations, or if optimalFormat is AVIF (implying a conversion preference)
  if (!isStyleProcessor && (hasActualOperations || optimalFormat === 'avif')) {
    let optimalFormat = '';
    const accept = ctx.get('Accept');
    if (accept) {
      if (accept.includes('image/avif')) optimalFormat = 'avif';
      else if (accept.includes('image/webp')) optimalFormat = 'webp';
    }

    if (optimalFormat === 'heif') {
      optimalFormat = 'avif'; // Force HEIF to AVIF
      console.log(`ossprocess: Overriding HEIF to AVIF for URI: ${uri}`);
    }

    // Check format and quality based on operationActions if they are the true list of operations
    const effectiveActionsForCheck = processorName === getProcessor('image').name && actions[0] !== processorName ? actions : operationActions;

    const formatActionExists = effectiveActionsForCheck.some(a => a.startsWith('format,'));
    if (!formatActionExists && optimalFormat) {
      const newFormatAction = `format,${optimalFormat}`;
      actions.push(newFormatAction); // Add to the main list of actions being processed
      if (processorName === getProcessor('image').name && actions[0] !== processorName) {
        // if operations did not include processor name, it's added to operationActions implicitly by adding to actions.
      } else {
         operationActions.push(newFormatAction); // Also keep operationActions in sync if it was separate
      }
      console.log(`ossprocess: Injected format action: ${newFormatAction} for URI: ${uri}`);
    }

    const qualityActionExists = effectiveActionsForCheck.some(a => a.startsWith('quality,'));
    if (!qualityActionExists) {
      let targetFormatForQuality = optimalFormat;
      const finalFormatActionDetails = actions.find(a => a.startsWith('format,'));
      if (finalFormatActionDetails) {
        targetFormatForQuality = finalFormatActionDetails.split(',')[1];
      }

      if (targetFormatForQuality) {
        const defaultQualityValue = getDefaultQualityForFormat(targetFormatForQuality);
        const newQualityAction = `quality,${defaultQualityValue}`;
        actions.push(newQualityAction);
        if (processorName === getProcessor('image').name && actions[0] !== processorName) {
            // as above
        } else {
            operationActions.push(newQualityAction);
        }
        console.log(`ossprocess: Injected quality action: ${newQualityAction} for format ${targetFormatForQuality}, URI: ${uri}`);
      }
    }
  }

  const bs = getBufferStore(ctx);
  const processor = getProcessor(processorName); // Now processorName is guaranteed to be set or an error thrown

  // Reconstruct final actions to be passed to newContext.
  // It should be [processorName, ...actual_operation_strings_including_injected_ones]
  // `actions` array has been modified with injections. If it didn't start with processorName, we prepend it.
  let finalActionsForNewContext: string[];
  if (actions.length > 0 && actions[0] === processorName) {
    finalActionsForNewContext = actions;
  } else {
    // This happens if processor was defaulted to 'image' and original actions were just operations.
    // `actions` here would be [op1, op2, injectedOp1, injectedOp2]
    finalActionsForNewContext = [processorName, ...actions];
  }
  // For style processor, actions would be ['style', 'stylename'], injection is skipped. So this is fine.

  const context = await processor.newContext(uri, finalActionsForNewContext, bs);
  const { data, type } = await processor.process(context);
  return { data, type, headers: context.headers };
}

async function validatePostRequest(ctx: Koa.ParameterizedContext) {
  const authHeader = ctx.get('X-Client-Authorization');
  const secretHeader = await getHeaderFromSecretsManager();
  if (authHeader !== secretHeader) throw new InvalidArgument('Invalid post header.');

  const body = ctx.request.body;
  if (!body) throw new InvalidArgument('Empty post body.');
  const valid = body.params && body.sourceBucket && body.sourceObject && body.targetBucket && body.targetObject;
  if (!valid) throw new InvalidArgument('Invalid post body.');
  return {
    params: body.params,
    sourceBucket: body.sourceBucket,
    sourceObject: body.sourceObject,
    targetBucket: body.targetBucket,
    targetObject: body.targetObject,
  };
}

function bypass() {
  throw new HttpErrors[403]('Please visit s3 directly');
}

async function getSecretFromSecretsManager() {
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
    if (data.Parameter && data.Parameter.Value) {
      const configJson = JSON.parse(data.Parameter.Value);
      if (is.number(configJson.max_gif_size_mb)) setMaxGifSizeMB(configJson.max_gif_size_mb);
      if (is.number(configJson.max_gif_pages)) setMaxGifPages(configJson.max_gif_pages);
    }
  }
}