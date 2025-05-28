FROM public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

# 复制源代码和依赖
COPY package.json package-lock.json tsconfig.json /app/
RUN apk update && \
    apk add fontconfig font-noto ffmpeg

# 安装所有依赖
RUN npm install --legacy-peer-deps

# 复制源代码
COPY . /app/

# 设置环境变量
ENV NODE_ENV=production
ENV AWS_SDK_LOAD_CONFIG=1
ENV AUTO_AVIF=true
ENV ALLOW_DIRECT_ACCESS=true

# 暴露端口
EXPOSE 8080

# 启动应用
CMD ["npx", "ts-node", "src/index.ts"]
