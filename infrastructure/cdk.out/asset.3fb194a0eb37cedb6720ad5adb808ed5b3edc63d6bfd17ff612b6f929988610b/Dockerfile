FROM public.ecr.aws/docker/library/node:14-alpine3.16 as builder

WORKDIR /app

# 复制源代码和依赖
COPY package.json package-lock.json tsconfig.json /app/
RUN apk update && \
    apk add fontconfig font-noto

# 安装所有依赖（包括开发依赖）
RUN npm install --legacy-peer-deps

# 复制源代码
COPY . /app/

# 编译TypeScript
RUN npm run compile

FROM public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

COPY package.json package-lock.json /app/
COPY ./fonts/* /usr/share/fonts/

# 安装依赖和工具
RUN apk update && \
    apk add fontconfig font-noto ffmpeg && \
    npm install --production --legacy-peer-deps

# 从builder阶段复制编译后的代码
COPY --from=builder /app/lib /app/lib

# 设置环境变量
ENV NODE_ENV=production
ENV AWS_SDK_LOAD_CONFIG=1
ENV AUTO_AVIF=true

# 暴露端口
EXPOSE 8080

# 启动应用
CMD ["node", "lib/src/index.js"]
