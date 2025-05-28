/**
 * 视频压缩示例脚本 - 展示如何使用ECS Image Handler的视频压缩功能
 */

// S3视频处理请求示例
const examples = [
  // 基本压缩 - 720p, 30fps, 默认质量
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_720p,r_30',
  
  // 低质量/低带宽压缩 - 适合移动网络
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_480p,r_24,q_28,br_800,preset_veryfast',
  
  // 高质量压缩 - 适合WiFi或有线网络
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_1080p,r_30,q_18,br_4000,preset_slow',
  
  // 转换为WebM格式
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_720p,r_30,fmt_webm',
  
  // HLS流格式 - 适合自适应流媒体
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_720p,r_30,fmt_hls',
  
  // 自定义尺寸压缩
  'https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_640x360,r_30,br_1000',
];

console.log('视频压缩功能使用示例：');
examples.forEach((url, index) => {
  console.log(`${index + 1}. ${url}`);
  console.log(`   - 参数解析: ${parseParameters(url)}\n`);
});

/**
 * 解析URL参数并返回可读的描述
 * @param {string} url 处理URL
 * @return {string} 参数解释
 */
function parseParameters(url) {
  const paramString = url.split('?')[1].split('video/compress,')[1];
  const params = paramString.split(',');
  
  let description = [];
  
  params.forEach(param => {
    const [key, value] = param.split('_');
    
    switch (key) {
      case 's':
        description.push(`分辨率: ${value}`);
        break;
      case 'r':
        description.push(`帧率: ${value}fps`);
        break;
      case 'q':
        description.push(`质量: ${value} (CRF值${value <= 18 ? '，高质量' : value >= 28 ? '，低质量' : '，中等质量'})`);
        break;
      case 'br':
        description.push(`比特率: ${value}kbps`);
        break;
      case 'fmt':
        description.push(`格式: ${value.toUpperCase()}`);
        break;
      case 'preset':
        description.push(`预设: ${value} (${getPresetDescription(value)})`);
        break;
    }
  });
  
  return description.join(' | ');
}

/**
 * 获取编码预设的描述
 * @param {string} preset 预设名称
 * @return {string} 预设描述
 */
function getPresetDescription(preset) {
  const presets = {
    'ultrafast': '极快速编码，质量较低',
    'superfast': '超快速编码，质量较低',
    'veryfast': '非常快速编码，质量一般',
    'faster': '较快编码，质量较好',
    'fast': '快速编码，质量较好',
    'medium': '平衡速度和质量',
    'slow': '慢速编码，质量优良',
    'slower': '较慢编码，质量优良',
    'veryslow': '非常慢编码，质量最佳'
  };
  
  return presets[preset] || '未知预设';
}

// 应用场景使用示例
console.log('常见应用场景：');
console.log('1. 移动端预览视频：');
console.log('   https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_480p,r_24,q_28,br_800,preset_veryfast');
console.log('2. 网站嵌入高质量视频：');
console.log('   https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_1080p,r_30,q_18,br_4000,preset_slow');
console.log('3. 自适应流媒体：');
console.log('   https://example.cloudfront.net/videos/sample.mp4?x-oss-process=video/compress,s_720p,r_30,fmt_hls');

// 多桶场景使用示例
console.log('\n多桶使用方式：');
console.log('在HTTP头中添加X-Bucket指定S3桶：');
console.log('GET /videos/sample.mp4?x-oss-process=video/compress,s_720p,r_30');
console.log('X-Bucket: my-video-bucket');
