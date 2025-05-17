import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const GB = 1024;

export class ECSImageHandler extends Construct {
  private originRequestPolicy: cloudfront.OriginRequestPolicy;
  private cachePolicy: cloudfront.CachePolicy;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 创建策略
    this.originRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'ForwardAllQueryString', {
      originRequestPolicyName: `${cdk.Stack.of(this).stackName}-${cdk.Aws.REGION}-FwdAllQS`,
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
    });
    
    this.cachePolicy = new cloudfront.CachePolicy(this, 'CacheAllQueryString', {
      cachePolicyName: `${cdk.Stack.of(this).stackName}-${cdk.Aws.REGION}-CacheAllQS`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    });

    // 获取资源
    const buckets = this.getBuckets('ImageBucket');
    const secret = this.getSecret();
    const table = new dynamodb.Table(this, 'StyleTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 开发环境使用，生产环境应改为RETAIN
    });

    this.cfnOutput('StyleConfig', table.tableName, 'The DynamoDB table for processing style');

    const configJsonParameter = this.getConfigJsonParameter();
    const vpc = this.getOrCreateVpc();
    const taskSubnets = this.getTaskSubnets(vpc);
    
    // 创建ECS Fargate服务
    const albFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      vpc: vpc,
      cpu: 4 * GB,
      memoryLimitMiB: 8 * GB,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../service')),
        containerPort: 8080,
        environment: {
          REGION: cdk.Aws.REGION,
          AWS_REGION: cdk.Aws.REGION,
          VIPS_DISC_THRESHOLD: '600m',
          SRC_BUCKET: buckets[0].bucketName,
          STYLE_TABLE_NAME: table.tableName,
          SECRET_NAME: secret?.secretArn || '',
          CONFIG_JSON_PARAMETER_NAME: configJsonParameter.parameterName,
          ...this.getEnvironmentVariables(),
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'ecs-image-handler',
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
      },
      publicLoadBalancer: this.getEnablePublicALB(),
      desiredCount: this.getECSDesiredCount(),
    });

    // 配置健康检查
    albFargateService.targetGroup.configureHealthCheck({
      path: '/ping',
      healthyThresholdCount: 3,
      timeout: cdk.Duration.seconds(10),
      interval: cdk.Duration.seconds(60),
    });

    // 配置自动扩展
    const scaling = albFargateService.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 20,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // 配置任务角色权限
    const taskRole = albFargateService.taskDefinition.taskRole;
    table.grantReadData(taskRole);
    configJsonParameter.grantRead(taskRole);

    // 构建逗号分隔的桶列表，用于环境变量
    const bucketNames = buckets.map(b => b.bucketName).join(',');

    // 更新容器环境变量，添加SRC_BUCKETS
    const container = albFargateService.taskDefinition.findContainer('web');
    if (container) {
      container.addEnvironment('SRC_BUCKETS', bucketNames);
    }

    for (const bkt of buckets) {
      taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: [
          's3:GetObject*',
          's3:GetBucket*',
          's3:List*',
          's3:PutObject*',
          's3:Abort*',
        ],
        resources: [bkt.bucketArn, `${bkt.bucketArn}/*`],
      }));
    }

    if (secret) {
      secret.grantRead(taskRole);
    }

    // 创建单个CloudFront分发支持多个存储桶
    if (this.getEnableCloudFront()) {
      // 创建一个包含所有存储桶的源组
      const originGroups: cloudfront.IOrigin[] = [];
      const originPathPatterns: Record<string, string[]> = {};
      
      // 为每个存储桶创建一个源组
      buckets.forEach((bkt, index) => {
        const bktoai = new cloudfront.OriginAccessIdentity(this, `S3Origin${index}`, {
          comment: `Identity for s3://${bkt.bucketName}`,
        });
        
        const bktplcy = new iam.PolicyStatement({
          resources: [bkt.arnForObjects('*')],
          actions: ['s3:GetObject'],
          principals: [bktoai.grantPrincipal],
        });
        
        bkt.addToResourcePolicy(bktplcy);
        
        // 创建源组
        const originGroup = new origins.OriginGroup({
          primaryOrigin: new origins.LoadBalancerV2Origin(
            albFargateService.loadBalancer,
            {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              customHeaders: {
                'x-bucket': bkt.bucketName,
              },
            }),
          fallbackOrigin: new origins.S3Origin(
            bkt,
            {
              originAccessIdentity: bktoai,
            }),
          fallbackStatusCodes: [403],
        });
        
        originGroups.push(originGroup);
        
        // 如果不是第一个存储桶，为其创建路径模式
        if (index > 0) {
          originPathPatterns[`/${bkt.bucketName}/*`] = [bkt.bucketName];
        }
      });
      
      // 创建单个分发
      const distribution = new cloudfront.Distribution(this, 'Distribution', {
        comment: `${cdk.Stack.of(this).stackName} distribution`,
        defaultBehavior: {
          origin: originGroups[0], // 第一个存储桶作为默认源
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: this.originRequestPolicy,
          cachePolicy: this.cachePolicy,
        },
        additionalBehaviors: this.createAdditionalBehaviors(originGroups, originPathPatterns),
        errorResponses: [
          { httpStatus: 500, ttl: cdk.Duration.seconds(10) },
          { httpStatus: 501, ttl: cdk.Duration.seconds(10) },
          { httpStatus: 502, ttl: cdk.Duration.seconds(10) },
          { httpStatus: 503, ttl: cdk.Duration.seconds(10) },
          { httpStatus: 504, ttl: cdk.Duration.seconds(10) },
        ],
      });
      
      this.cfnOutput('DistributionUrl', `https://${distribution.distributionDomainName}`, 
        'The CloudFront distribution url for all buckets');
    }
  }

  private createAdditionalBehaviors(origins: cloudfront.IOrigin[], pathPatterns: Record<string, string[]>): Record<string, cloudfront.BehaviorOptions> {
    const behaviors: Record<string, cloudfront.BehaviorOptions> = {};
    
    // 为每个路径模式创建行为
    Object.entries(pathPatterns).forEach(([pathPattern, bucketNames]) => {
      if (bucketNames.length > 0) {
        // 找到对应的源索引
        const bucketName = bucketNames[0];
        const originIndex = this.findOriginIndexByBucketName(origins, bucketName);
        
        if (originIndex >= 0) {
          behaviors[pathPattern] = {
            origin: origins[originIndex],
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            originRequestPolicy: this.originRequestPolicy,
            cachePolicy: this.cachePolicy,
          };
        }
      }
    });
    
    return behaviors;
  }
  
  private findOriginIndexByBucketName(origins: cloudfront.IOrigin[], bucketName: string): number {
    // 这个方法在实际使用中可能需要更复杂的逻辑来匹配源和存储桶名称
    // 简单起见，我们假设源的索引与存储桶的索引相同
    const buckets: string[] = this.node.tryGetContext('buckets');
    return buckets.findIndex(bkt => bkt === bucketName);
  }

  private cfnOutput(id: string, value: string, description?: string) {
    const o = new cdk.CfnOutput(this, id, { value, description });
    o.overrideLogicalId(id);
    return o;
  }

  private getConfigJsonParameter() {
    const name = this.node.tryGetContext('config_json_parameter_name');
    if (name) {
      return ssm.StringParameter.fromStringParameterName(this, 'ConfigJsonParameter', name);
    } else {
      throw new Error('Missing "config_json_parameter_name" in cdk.context.json');
    }
  }

  private getOrCreateVpc(): ec2.IVpc {
    if (this.node.tryGetContext('use_default_vpc') === '1' || process.env.CDK_USE_DEFAULT_VPC === '1') {
      return ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true });
    } else if (this.node.tryGetContext('use_vpc_id')) {
      return ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: this.node.tryGetContext('use_vpc_id') });
    }
    return new ec2.Vpc(this, 'Vpc', { 
      maxAzs: 3, 
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ]
    });
  }

  private getTaskSubnets(vpc: ec2.IVpc): ec2.ISubnet[] {
    const subnetIds: string[] = this.node.tryGetContext('subnet_ids') || [];
    if (subnetIds.length) {
      return subnetIds.map((subnetId, index) => ec2.Subnet.fromSubnetId(this, `subnet${index}`, subnetId));
    } else {
      return vpc.privateSubnets;
    }
  }

  private getEnablePublicALB(defaultValue: boolean = true): boolean {
    const publicLoadBalancer = this.node.tryGetContext('enable_public_alb');
    if (publicLoadBalancer === false) {
      return publicLoadBalancer;
    } else {
      return defaultValue;
    }
  }

  private getEnableCloudFront(defaultValue: boolean = true): boolean {
    const enableCloudFront = this.node.tryGetContext('enable_cloudfront');
    if (enableCloudFront === false) {
      return enableCloudFront;
    } else {
      return defaultValue;
    }
  }

  private getBuckets(id: string): s3.IBucket[] {
    const buckets: string[] = this.node.tryGetContext('buckets');
    if (!Array.isArray(buckets)) {
      throw new Error('Can\'t find context key="buckets" or the context key="buckets" is not an array of string.');
    }
    if (buckets.length < 1) {
      throw new Error('You must specify at least one bucket.');
    }

    return buckets.map((bkt: string, index: number) => s3.Bucket.fromBucketName(this, `${id}${index}`, bkt));
  }

  private getSecret(): secretsmanager.ISecret | undefined {
    const secretArn = this.node.tryGetContext('secret_arn');
    if (secretArn) {
      return secretsmanager.Secret.fromSecretCompleteArn(this, 'ImportedSecret', secretArn);
    } else {
      console.warn('You may specify one secret manager arn for POST security.');
      return undefined;
    }
  }

  private getECSDesiredCount(defaultCount: number = 8): number {
    const desiredCount = this.node.tryGetContext('ecs_desired_count');
    if (desiredCount) {
      return desiredCount;
    }
    return defaultCount;
  }

  private getEnvironmentVariables(): Record<string, string> {
    return this.node.tryGetContext('env') || {};
  }
}
