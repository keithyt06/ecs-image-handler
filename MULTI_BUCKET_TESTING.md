# ECS Image Handler 多存储桶功能测试

## 测试环境

- **区域**: us-west-2 (俄勒冈)
- **ECS 集群**: ecs-image-handler-stack-EcsDefaultClusterMnL3mNNYNVpc18E0451A-HZEeZYRF7pp6
- **ALB 域名**: ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com
- **CloudFront 域名**: d3at10zr2ok7pn.cloudfront.net
- **存储桶**:
  - 默认存储桶: new-uw2-img
  - 第二存储桶: new-uw2-img2

## 测试结果

### 1. 默认存储桶访问测试

不带 `x-bucket` 头的请求会使用默认存储桶 (new-uw2-img):

```bash
curl -o test-no-header.png "http://ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com/test-image.png?x-oss-process=image/resize,w_200,h_150"
```

结果: 成功从默认存储桶获取并处理图像，生成了 200x133 的 PNG 图像。

### 2. 指定存储桶访问测试

带 `x-bucket` 头的请求会使用指定的存储桶:

```bash
curl -H "x-bucket: new-uw2-img2" -o test-header-bucket.jpg "http://ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com/test-image.jpg?x-oss-process=image/resize,w_400,h_300"
```

结果: 成功从 new-uw2-img2 存储桶获取并处理图像，生成了 200x300 的 JPEG 图像。

### 3. 格式转换测试

#### 默认存储桶格式转换:

```bash
curl -o test-no-header-webp.webp "http://ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com/test-image.png?x-oss-process=image/format,webp"
```

结果: 成功将默认存储桶中的 PNG 图像转换为 WebP 格式。

#### 指定存储桶格式转换:

```bash
curl -H "x-bucket: new-uw2-img2" -o test-header-bucket-webp.webp "http://ecs-im-ECSIm-0eFv5yh0Jd81-1058978694.us-west-2.elb.amazonaws.com/test-image.jpg?x-oss-process=image/format,webp"
```

结果: 成功将 new-uw2-img2 存储桶中的 JPEG 图像转换为 WebP 格式。

### 4. CloudFront 访问测试

#### 默认存储桶通过 CloudFront 访问:

```bash
curl -o cloudfront-no-header.png "https://d3at10zr2ok7pn.cloudfront.net/test-image.png?x-oss-process=image/resize,w_200,h_150"
```

结果: 成功通过 CloudFront 从默认存储桶获取并处理图像。

#### 指定存储桶通过 CloudFront 访问:

```bash
curl -H "x-bucket: new-uw2-img2" -o cloudfront-header-bucket.jpg "https://d3at10zr2ok7pn.cloudfront.net/test-image.jpg?x-oss-process=image/resize,w_400,h_300"
```

结果: 成功通过 CloudFront 从 new-uw2-img2 存储桶获取并处理图像。

## 结论

ECS Image Handler 的多存储桶功能工作正常。系统能够:

1. 在不指定 `x-bucket` 头时使用默认存储桶
2. 在指定 `x-bucket` 头时使用指定的存储桶
3. 对不同存储桶中的图像执行各种处理操作 (调整大小、格式转换等)
4. 通过 CloudFront 和 ALB 正确处理多存储桶请求

这种设计提供了很好的灵活性，既方便了普通用户的使用 (不需要指定存储桶)，又为需要更复杂功能的用户提供了灵活性 (可以指定不同的存储桶)。
