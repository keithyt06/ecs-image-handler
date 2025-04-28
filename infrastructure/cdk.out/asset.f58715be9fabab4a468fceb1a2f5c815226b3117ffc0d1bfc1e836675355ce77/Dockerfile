FROM public.ecr.aws/docker/library/node:14-alpine3.16 as builder

WORKDIR /app

COPY package.json yarn.lock /app/

# 安装字体和其他依赖
RUN apk update && \
    apk add fontconfig font-noto

# 安装依赖
RUN yarn

# 复制源代码
COPY . .

# 创建lib目录并复制src目录
RUN mkdir -p /app/lib && \
    cp -r /app/src /app/lib/ && \
    find /app/lib -name "*.ts" -exec sh -c 'tsc "$0" --outDir "$(dirname "$0")" --allowJs --checkJs false --noEmit false --skipLibCheck true --moduleResolution node --target es2018 --module commonjs' {} \;


FROM public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

COPY package.json yarn.lock /app/
COPY ./fonts/* /usr/share/fonts/

# 安装字体和ffmpeg
RUN apk update && \
    apk add fontconfig font-noto ffmpeg

ENV NODE_ENV=production

# 安装生产依赖
RUN yarn --production && \
    yarn cache clean --all

# 从builder阶段复制编译后的文件
COPY --from=builder /app/lib /app/lib

EXPOSE 8080

# 运行编译后的JavaScript文件
CMD ["node", "/app/lib/src/index.js"]
