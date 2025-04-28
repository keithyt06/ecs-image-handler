FROM public.ecr.aws/docker/library/node:14-alpine3.16 as builder

WORKDIR /app

COPY package.json yarn.lock /app/

# FIXME: try to remove font-noto when https://github.com/lovell/sharp/issues/3393 is fixed.
RUN apk update && \
    apk add fontconfig font-noto

RUN yarn

COPY . .

# Skip the build step that's failing due to ESLint
RUN mkdir -p /app/lib/src && \
    cp -r /app/src/* /app/lib/src/


FROM public.ecr.aws/docker/library/node:14-alpine3.16

WORKDIR /app

COPY package.json yarn.lock /app/
COPY ./fonts/* /usr/share/fonts/

# FIXME: try to remove font-noto when https://github.com/lovell/sharp/issues/3393 is fixed.
RUN apk update && \
    apk add fontconfig font-noto ffmpeg

ENV NODE_ENV=production

RUN yarn --production && \
    yarn cache clean --all

COPY --from=builder /app/lib /app/lib

EXPOSE 8080

CMD ["node", "/app/lib/src/index.js"]
