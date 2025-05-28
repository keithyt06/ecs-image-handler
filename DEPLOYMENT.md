# ECS Image Handler 部署文档

## 概述

ECS Image Handler 是一个基于 AWS ECS Fargate 的无服务器图像处理解决方案，它允许您动态处理存储在 S3 中的图像。本文档详细说明了部署步骤和使用方法。

## 先决条件

- AWS 账户和适当的权限
- 已安装并配置 AWS CLI
- Node.js (版本 14.x 或更高)
- AWS CDK v2 (`npm install -g aws-cdk`)
- Docker (用于构建容器镜像)

## 部署步骤

### 1. 克隆代码库

```bash
git clone https://github.com/brilliantwf/ecs-image-handler.git
cd ecs-image-handler
```

### 2. 配置 CDK 上下文

编辑 `infrastructure/cdk.context.json` 文件，配置多个存储桶和部署区域：

```json
{
  "buckets": [
    "primary-image-bucket",
    "secondary-image-bucket"
  ],
  "config_json_parameter_name": "/ecs-image-handler/config",
  "ecs_desired_count": 2,
  "enable_waf": false,
  "enable_cloudfront": true,
  "enable_public_alb": true,
  "use_default_vpc": "0",
  "region": "us-west-2",  // 指定部署区域
  "env": {
    "AWS_SDK_LOAD_CONFIG": "1"
  }
}
```

### 3. 创建 SSM 参数

在指定的区域创建 SSM 参数：

```bash
aws ssm put-parameter \
  --name "/ecs-image-handler/config" \
  --type "String" \
  --value '{"max_gif_size_mb": 10, "max_gif_pages": 200}' \
  --region us-west-2 \  # 使用您指定的区域
  --overwrite
```

### 4. 创建 S3 存储桶

为配置中的每个存储桶创建 S3 存储桶（在指定区域）：

```bash
aws s3 mb s3://primary-image-bucket --region us-west-2
aws s3 mb s3://secondary-image-bucket --region us-west-2
```

### 5. 安装依赖项

```bash
# 安装基础设施依赖项
cd infrastructure
npm install

# 安装服务依赖项
cd ../service
npm install --legacy-peer-deps
```

### 6. 引导 CDK

在指定区域引导 CDK：

```bash
cd ../infrastructure
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-west-2  # 使用您指定的区域
```

将 `YOUR_ACCOUNT_ID` 替换为您的 AWS 账户 ID。

### 7. 部署堆栈

```bash
cdk deploy --require-approval never
```

部署过程大约需要 10-15 分钟完成。

### 8. 上传测试图像

将测试图像上传到您配置的每个存储桶：

```bash
aws s3 cp ../service/test/fixtures/example.jpg s3://primary-image-bucket/ --region us-west-2
aws s3 cp ../service/test/fixtures/example.jpg s3://secondary-image-bucket/ --region us-west-2
```

## 多区域部署

ECS Image Handler 支持部署到任何 AWS 区域。要在特定区域部署，请按照以下步骤操作：

1. 在 `cdk.context.json` 中添加 `"region": "your-region-code"`
2. 修改 `app.ts` 以使用上下文中指定的区域（已在代码中实现）
3. 确保在指定区域创建所有必要的资源（S3 存储桶、SSM 参数等）
4. 在指定区域引导 CDK：`cdk bootstrap aws://YOUR_ACCOUNT_ID/your-region-code`
5. 部署堆栈：`cdk deploy`

## 测试部署

部署完成后，您将获得以下输出：

- CloudFront 分发 URL (例如: `https://d3at10zr2ok7pn.cloudfront.net`)
- 负载均衡器 URL (例如: `http://ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com`)
- DynamoDB 样式表名称

### 测试图像处理功能

#### 通过 CloudFront 访问图像

您可以通过以下两种方式访问和处理图像：

1. **使用默认存储桶**（不需要指定 `x-bucket` 头）：

```bash
# 使用默认存储桶访问 CloudFront 分发
curl "https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200" -o resized-image.jpg
```

2. **指定特定存储桶**（使用 `x-bucket` 头）：

```bash
# 使用 curl 访问 CloudFront 分发，指定存储桶
curl -H "x-bucket: primary-image-bucket" "https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200" -o resized-image.jpg
```

> **注意**: 由于 CloudFront 默认不会转发 `x-bucket` 头，您需要配置 CloudFront 转发此头部，或通过 ALB 直接访问。

#### 通过 ALB 直接访问

1. **使用默认存储桶**：

```bash
# 使用默认存储桶直接访问 ALB
curl "http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200" -o resized-image.jpg
```

2. **指定特定存储桶**：

```bash
# 使用 curl 直接访问 ALB，指定存储桶
curl -H "x-bucket: secondary-image-bucket" "http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200" -o resized-image.jpg
```

#### 支持的图像处理操作

##### 调整大小

```
http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200
```

##### 转换格式

```
http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/format,webp
```

##### 调整质量

```
http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/quality,q_80
```

##### 组合多个转换

```
http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200/quality,q_80/format,webp
```

## 多存储桶架构

ECS Image Handler 支持多个 S3 存储桶，通过以下方式实现：

1. **默认存储桶**：在 `cdk.context.json` 中配置的第一个存储桶被设置为默认存储桶
2. **指定存储桶**：通过 `x-bucket` 请求头指定要使用的存储桶

### 工作原理

1. 当请求到达服务时，系统会检查是否存在 `x-bucket` 头
2. 如果存在 `x-bucket` 头，则使用指定的存储桶
3. 如果不存在 `x-bucket` 头，则使用默认存储桶
4. 从选定的存储桶获取图像并进行处理
5. 处理后的图像返回给客户端

### 配置多存储桶

在 `cdk.context.json` 中配置多个存储桶：

```json
{
  "buckets": [
    "default-bucket",  // 第一个存储桶将作为默认存储桶
    "secondary-bucket",
    "tertiary-bucket"
  ],
  // 其他配置...
}
```

部署后，ECS 任务将配置环境变量：
- `SRC_BUCKET`: 设置为第一个存储桶（默认存储桶）
- `SRC_BUCKETS`: 设置为所有配置的存储桶列表

## 故障排除

### 常见问题：ARM 架构兼容性

如果您在 ARM 架构的 Mac 上构建镜像，可能会遇到 `exec /usr/local/bin/docker-entrypoint.sh: exec format error` 错误。这是因为 ECS 默认使用 x86_64 架构。解决方法是在 Dockerfile 中使用 `--platform=linux/amd64` 标志。

### 网络连接问题

如果在构建过程中遇到网络错误，请确保您的网络连接稳定，并且可以访问 Alpine Linux 软件包仓库。

### 存储桶访问问题

如果遇到存储桶访问问题，请检查：

1. 存储桶名称是否正确配置在 `cdk.context.json` 中
2. ECS 任务角色是否有权限访问所有配置的存储桶
3. 存储桶是否存在于指定的区域中
4. 如果使用非默认存储桶，请求中是否正确设置了 `x-bucket` 头
5. 如果通过 CloudFront 使用 `x-bucket` 头，确保 CloudFront 已配置为转发此头部

### 区域特定问题

如果在特定区域部署时遇到问题：

1. 确保在该区域创建了所有必要的资源
2. 检查该区域是否支持所有使用的服务
3. 确保 CDK 已在该区域正确引导

## 监控和管理

- 使用 CloudWatch 查看 ECS 服务日志
- 通过 CloudFront 控制台监控缓存命中率
- 使用 ECS 控制台管理服务扩展

## 清理资源

如果您需要删除所有创建的资源：

```bash
cd infrastructure
cdk destroy

# 删除所有创建的 S3 存储桶
aws s3 rm s3://primary-image-bucket --recursive --region us-west-2
aws s3 rb s3://primary-image-bucket --region us-west-2
aws s3 rm s3://secondary-image-bucket --recursive --region us-west-2
aws s3 rb s3://secondary-image-bucket --region us-west-2
```

## 参考资料

- [AWS ECS 文档](https://docs.aws.amazon.com/ecs/)
- [AWS CloudFront 文档](https://docs.aws.amazon.com/cloudfront/)
- [AWS CDK 文档](https://docs.aws.amazon.com/cdk/)
