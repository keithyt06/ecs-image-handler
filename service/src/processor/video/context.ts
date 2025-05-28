import { IProcessContext } from '..';

/**
 * 扩展处理上下文接口，添加结果属性
 */
export interface IExtendedProcessContext extends IProcessContext {
  /**
   * 处理结果，由action设置，然后由processor返回
   */
  result?: {
    data: Buffer | string;
    type: string;
  };
}
