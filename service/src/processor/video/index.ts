import * as child_process from 'child_process';
import { IAction, InvalidArgument, IProcessContext, IProcessor, IProcessResponse } from '..';
import { ActionMask } from '../image/_base';
import { IBufferStore } from '../../store';
import * as is from '../../is';
import { IExtendedProcessContext } from './context';
import { SnapshotAction } from './snapshot.action';
import { CompressAction } from './compress.action';
import { TranscodeAction } from './transcode.action';

export * from './context';
export * from './snapshot.action';
export * from './compress.action';
export * from './transcode.action';

/**
 * 视频处理器 - 支持截图、转码、压缩等操作
 */
export class VideoProcessor implements IProcessor {
  public static getInstance(): VideoProcessor {
    if (!VideoProcessor._instance) {
      const instance = new VideoProcessor();
      
      // 注册默认的视频处理功能
      instance.register(
        new SnapshotAction(),
        new CompressAction(),
        new TranscodeAction()
      );
      
      VideoProcessor._instance = instance;
    }
    return VideoProcessor._instance;
  }
  
  private static _instance: VideoProcessor;
  private actions: Map<string, IAction> = new Map();
  public readonly name: string = 'video';

  private constructor() { }

  public register(...actions: IAction[]): void {
    for (const action of actions) {
      this.actions.set(action.name, action);
      console.log(`已注册视频处理Action: ${action.name}`);
    }
  }

  public async newContext(uri: string, actions: string[], bufferStore: IBufferStore): Promise<IProcessContext> {
    const ctx: IExtendedProcessContext = {
      uri,
      actions,
      mask: new ActionMask(actions),
      bufferStore,
      features: {},
      headers: {}
    };
    
    return Promise.resolve(ctx);
  }

  public async process(ctx: IProcessContext): Promise<IProcessResponse> {
    if (!ctx.actions || ctx.actions.length < 2) {
      throw new InvalidArgument('Invalid video request! Actions not provided.');
    }
    
    const action = ctx.actions[1];
    if (!is.string(action)) {
      throw new InvalidArgument('Invalid action format!');
    }
    
    const params = action.split(',');
    const actionName = params[0];
    const actionHandler = this.actions.get(actionName);
    
    if (!actionHandler) {
      throw new InvalidArgument(`Unsupported video action: ${actionName}`);
    }
    
    console.log(`处理视频请求: ${ctx.uri}, 操作: ${actionName}`);
    
    // 转换为扩展上下文类型
    const extCtx = ctx as IExtendedProcessContext;
    
    // 调用相应的Action处理
    await actionHandler.process(extCtx, params);
    
    // 如果Action没有设置结果，返回空JSON
    if (!extCtx.result) {
      return { data: '{}', type: 'application/json' };
    }
    
    // 返回处理结果
    return {
      data: extCtx.result.data,
      type: extCtx.result.type
    };
  }
}
