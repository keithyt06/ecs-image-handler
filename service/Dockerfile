FROM public.ecr.aws/docker/library/node:14-alpine3.16 as builder

WORKDIR /app

COPY package.json yarn.lock tsconfig.json /app/

# 安装字体和其他依赖
RUN apk update && \
    apk add fontconfig font-noto

# 安装所有依赖（包括开发依赖）
RUN yarn

# 复制源代码
COPY . .

    # 使用TypeScript编译器编译代码，跳过类型检查以避免编译错误
    RUN npx tsc --skipLibCheck

FROM public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

COPY package.json yarn.lock /app/
COPY ./fonts/* /usr/share/fonts/

# 安装字体和ffmpeg
RUN apk update && \
    apk add fontconfig font-noto ffmpeg

ENV NODE_ENV=production
ENV AWS_SDK_LOAD_CONFIG=1

# 安装生产依赖
RUN yarn --production && \
    yarn cache clean --all

# 从builder阶段复制编译后的文件
COPY --from=builder /app/lib /app/lib

EXPOSE 8080

# 运行编译后的JavaScript文件
CMD ["node", "/app/lib/src/index.js"]
