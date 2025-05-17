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

编辑 `infrastructure/cdk.context.json` 文件，配置多个存储桶：

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
  "env": {
    "AWS_SDK_LOAD_CONFIG": "1"
  }
}
```

### 3. 创建 SSM 参数

```bash
aws ssm put-parameter \
  --name "/ecs-image-handler/config" \
  --type "String" \
  --value '{"max_gif_size_mb": 10, "max_gif_pages": 200}' \
  --region us-east-1 \
  --overwrite
```

### 4. 创建 S3 存储桶

为配置中的每个存储桶创建 S3 存储桶：

```bash
aws s3 mb s3://primary-image-bucket --region us-east-1
aws s3 mb s3://secondary-image-bucket --region us-east-1
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

```bash
cd ../infrastructure
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
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
aws s3 cp ../service/test/fixtures/example.jpg s3://primary-image-bucket/ --region us-east-1
aws s3 cp ../service/test/fixtures/example.jpg s3://secondary-image-bucket/ --region us-east-1
```

## 测试部署

部署完成后，您将获得以下输出：

- CloudFront 分发 URL (例如: `https://d2qvdkbt8bw2xk.cloudfront.net`)
- 负载均衡器 URL (例如: `http://ecs-im-ECSIm-X7zuCTm6xond-6584781.us-east-1.elb.amazonaws.com`)
- DynamoDB 样式表名称

### 测试图像处理功能

#### 通过 CloudFront 访问多个存储桶中的图像

ECS Image Handler 现在支持通过单个 CloudFront 分发访问多个 S3 存储桶中的图像。有两种方式可以指定要访问的存储桶：

1. **通过路径前缀指定存储桶**（推荐用于 CloudFront 访问）：

```
# 访问默认存储桶（第一个配置的存储桶）中的图像
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200

# 访问指定存储桶中的图像
https://YOUR_CLOUDFRONT_DOMAIN/secondary-image-bucket/example.jpg?x-oss-process=image/resize,w_300,h_200
```

2. **通过 HTTP 头指定存储桶**（适用于直接访问 ALB）：

```bash
curl -H "x-bucket: secondary-image-bucket" "http://YOUR_ALB_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200"
```

#### 支持的图像处理操作

##### 调整大小

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200
```

##### 转换格式

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/format,webp
```

##### 调整质量

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/quality,q_80
```

##### 组合多个转换

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200/quality,q_80/format,webp
```

## 多存储桶架构

ECS Image Handler 使用单个 CloudFront 分发来支持多个 S3 存储桶，具有以下优势：

1. **简化管理**：只需管理一个 CloudFront 分发，而不是为每个存储桶创建单独的分发
2. **统一域名**：所有图片都通过同一个域名访问，只是路径不同
3. **灵活性**：可以轻松添加新的存储桶，只需更新 `cdk.context.json` 中的配置
4. **缓存效率**：单一分发可以更有效地利用 CloudFront 缓存

### 工作原理

1. 当请求到达 CloudFront 时，它会被转发到 ECS Fargate 服务
2. 服务会检查请求路径，提取存储桶名称（如果存在）
3. 如果路径中包含存储桶名称，服务会设置相应的 `x-bucket` 头
4. 服务根据 `x-bucket` 头选择正确的 S3 存储桶进行图像处理
5. 处理后的图像通过 CloudFront 返回给客户端并缓存

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
aws s3 rm s3://primary-image-bucket --recursive
aws s3 rb s3://primary-image-bucket
aws s3 rm s3://secondary-image-bucket --recursive
aws s3 rb s3://secondary-image-bucket
```

## 参考资料

- [AWS ECS 文档](https://docs.aws.amazon.com/ecs/)
- [AWS CloudFront 文档](https://docs.aws.amazon.com/cloudfront/)
- [AWS CDK 文档](https://docs.aws.amazon.com/cdk/)
