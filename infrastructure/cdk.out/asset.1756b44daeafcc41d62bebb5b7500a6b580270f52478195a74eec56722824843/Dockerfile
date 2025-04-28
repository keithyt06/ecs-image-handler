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

# 编译TypeScript文件，但跳过测试和ESLint
RUN npx tsc


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
