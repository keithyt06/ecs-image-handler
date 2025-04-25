import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ECSImageHandler } from './ecs-image-handler';

export class ECSImageHandlerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 添加标签
    const tags = this.node.tryGetContext('stack_tags') || {};
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value as string);
    });

    // 创建ECS Image Handler
    new ECSImageHandler(this, 'ECSImageHandler');
  }
}
