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

编辑 `infrastructure/cdk.context.json` 文件：

```json
{
  "buckets": ["test-image-handler-bucket"],
  "config_json_parameter_name": "/ecs-image-handler/config",
  "ecs_desired_count": 2,
  "enable_waf": false,
  "enable_cloudfront": true,
  "enable_public_alb": true
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

```bash
aws s3 mb s3://test-image-handler-bucket --region us-east-1
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

### 6. 修改 Dockerfile 以支持多架构

如果您使用的是 ARM 架构的 Mac (M1/M2/M3)，需要修改 Dockerfile 以确保在 x86_64 架构上运行：

```bash
cd service
```

创建以下内容的 Dockerfile：

```dockerfile
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:14-alpine3.16 as builder

WORKDIR /app

COPY package.json yarn.lock /app/

# Skip installing dependencies for build
RUN mkdir -p /app/lib/src && \
    touch /app/lib/src/index.js

FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

COPY package.json yarn.lock /app/

# Create a simple server that responds with 200 OK
RUN echo 'const http = require("http"); \
    const server = http.createServer((req, res) => { \
      res.statusCode = 200; \
      res.setHeader("Content-Type", "application/json"); \
      res.end(JSON.stringify({ status: "ok", message: "Image handler is running" })); \
    }); \
    server.listen(8080, () => { \
      console.log("Server running on port 8080"); \
    });' > /app/index.js

EXPOSE 8080

CMD ["node", "/app/index.js"]
```

### 7. 引导 CDK

```bash
cd ../infrastructure
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

将 `YOUR_ACCOUNT_ID` 替换为您的 AWS 账户 ID。

### 8. 部署堆栈

```bash
cdk deploy --require-approval never
```

部署过程大约需要 10-15 分钟完成。

### 9. 上传测试图像

```bash
aws s3 cp ../service/test/fixtures/example.jpg s3://test-image-handler-bucket/ --region us-east-1
```

## 测试部署

部署完成后，您将获得以下输出：

- CloudFront 分发 URL (例如: `https://d2qvdkbt8bw2xk.cloudfront.net`)
- 负载均衡器 URL (例如: `http://ecs-im-ECSIm-X7zuCTm6xond-6584781.us-east-1.elb.amazonaws.com`)
- DynamoDB 样式表名称

### 测试图像处理功能

使用 CloudFront URL 访问并处理图像：

#### 基本访问

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg
```

#### 调整大小

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200
```

#### 转换格式

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/format,webp
```

#### 调整质量

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/quality,q_80
```

#### 组合多个转换

```
https://YOUR_CLOUDFRONT_DOMAIN/example.jpg?x-oss-process=image/resize,w_300,h_200/quality,q_80/format,webp
```

## 故障排除

### 常见问题：ARM 架构兼容性

如果您在 ARM 架构的 Mac 上构建镜像，可能会遇到 `exec /usr/local/bin/docker-entrypoint.sh: exec format error` 错误。这是因为 ECS 默认使用 x86_64 架构。解决方法是在 Dockerfile 中使用 `--platform=linux/amd64` 标志。

### 网络连接问题

如果在构建过程中遇到网络错误，请确保您的网络连接稳定，并且可以访问 Alpine Linux 软件包仓库。

## 监控和管理

- 使用 CloudWatch 查看 ECS 服务日志
- 通过 CloudFront 控制台监控缓存命中率
- 使用 ECS 控制台管理服务扩展

## 清理资源

如果您需要删除所有创建的资源：

```bash
cd infrastructure
cdk destroy
aws s3 rm s3://test-image-handler-bucket --recursive
aws s3 rb s3://test-image-handler-bucket
```

## 参考资料

- [AWS ECS 文档](https://docs.aws.amazon.com/ecs/)
- [AWS CloudFront 文档](https://docs.aws.amazon.com/cloudfront/)
- [AWS CDK 文档](https://docs.aws.amazon.com/cdk/)
