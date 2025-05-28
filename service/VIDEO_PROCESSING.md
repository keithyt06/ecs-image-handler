# 视频处理功能指南

ECS Image Handler 现在支持视频处理功能，包括截图、压缩和转码。本文档提供了这些功能的详细使用说明。

## 视频处理API概览

视频处理API的基本格式为：

```
GET /<video-path>?x-oss-process=video/<action>,<参数列表>
```

其中：
- `<video-path>` 是存储在S3桶中的视频文件路径
- `<action>` 是要执行的操作，如 `snapshot`（截图）、`compress`（压缩）或 `transcode`（转码）
- `<参数列表>` 是特定操作的参数，格式为 `key_value,key_value,...`

## 支持的视频格式

- **输入格式**：mp4, mov, avi, mkv, webm, flv
- **输出格式**：mp4, webm, hls (HTTP Live Streaming)

## 功能详解

### 1. 视频截图 (snapshot)

从视频中截取特定时间点的一帧作为图片。

**参数**:

| 参数 | 说明 | 默认值 | 可选值 |
|------|------|--------|--------|
| t_<值> | 截图时间（毫秒） | 1000 | 任何非负整数 |
| f_<值> | 输出格式 | jpg | jpg, png |
| m_<值> | 截图模式 | fast | fast (使用最近的关键帧) |

**示例**:

```
https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/snapshot,t_5000,f_jpg,m_fast
```

上述请求从sample.mp4视频的第5秒截取一张JPG格式的图片。

### 2. 视频压缩 (compress)

对视频进行压缩，适合用于生成预览或减小文件大小。

**参数**:

| 参数 | 说明 | 默认值 | 可选值 |
|------|------|--------|--------|
| q_<值> | 质量参数 (CRF值) | 23 | 1-51 (值越小质量越高) |
| r_<值> | 帧率 | 30 | 1-60 |
| s_<值> | 分辨率 | 720p | 360p、480p、720p、1080p或自定义(如640x480) |
| br_<值> | 视频比特率(kbps) | 1500 | 100+ |
| fmt_<值> | 输出格式 | mp4 | mp4、webm、hls |
| preset_<值> | 编码预设 | medium | ultrafast、superfast、veryfast、faster、fast、medium、slow、slower、veryslow |

**示例**:

```
https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,q_23,r_30,s_720p,br_1500,fmt_mp4,preset_fast
```

上述请求将sample.mp4视频压缩为720p分辨率、30fps帧率、1500kbps比特率的MP4格式，使用CRF值23作为质量参数，fast预设进行编码。

### 3. 视频转码 (transcode)

将视频从一种格式转换为另一种格式，或者更改编码参数。

**参数**:

| 参数 | 说明 | 默认值 | 可选值 |
|------|------|--------|--------|
| fmt_<值> | 输出格式 | mp4 | mp4、webm、mov、avi、mkv、flv、hls |
| vcodec_<值> | 视频编码器 | libx264 | libx264、libx265、libvpx、libvpx-vp9、copy |
| acodec_<值> | 音频编码器 | aac | aac、libmp3lame、libvorbis、opus、copy |
| abr_<值> | 音频比特率(kbps) | 128 | 32-320 |
| profile_<值> | 编码配置文件 | main | baseline、main、high |

**示例**:

```
https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/transcode,fmt_webm,vcodec_libvpx,acodec_libvorbis
```

上述请求将sample.mp4视频转码为WebM格式，使用libvpx视频编码器和libvorbis音频编码器。

## 使用多桶功能

视频处理功能完全支持多桶功能，使用方式与图像处理相同。通过在请求中添加`x-bucket`头，可以指定从哪个S3桶获取视频文件：

```
GET /<video-path>?x-oss-process=video/compress,q_23,r_30,s_720p
X-Bucket: my-video-bucket
```

## 性能与限制

为了避免过度消耗资源，视频处理功能有以下限制：

- 最大输出视频大小：100MB
- 最长处理时间：300秒
- 视频处理任务会消耗较多资源，请合理使用参数以减少处理时间和资源占用

## 缓存策略

处理后的视频将被CloudFront缓存，缓存键包含所有处理参数和桶名称。这意味着相同的处理请求将直接从缓存中获取结果，无需重新处理。

## 最佳实践

1. **预设参数选择**：
   - 对于需要快速预览的场景，使用 `preset_veryfast` 或 `preset_ultrafast`
   - 对于需要平衡质量和速度的场景，使用 `preset_medium`（默认）
   - 对于需要最高质量的场景，使用 `preset_slow` 或 `preset_veryslow`

2. **分辨率和比特率匹配**：
   - 360p: 使用500-800kbps的比特率
   - 480p: 使用800-1200kbps的比特率
   - 720p: 使用1500-4000kbps的比特率
   - 1080p: 使用4000-8000kbps的比特率

3. **HLS格式**：
   - 对于需要自适应流播放的场景，选择HLS格式
   - HLS格式将生成多个文件，包括一个主播放列表和多个分段视频文件

## 故障排除

如果遇到视频处理错误，请查看响应中的错误信息。常见的错误包括：

- **400 Bad Request**：参数无效或不支持的格式
- **404 Not Found**：找不到指定的视频文件
- **500 Internal Server Error**：视频处理过程中发生错误
- **504 Gateway Timeout**：视频处理超时

更详细的错误信息可以从CloudWatch日志中获取。
