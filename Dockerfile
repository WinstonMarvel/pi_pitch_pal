# Stage 1: Dependencies
FROM alpine:3.21 AS dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    yt-dlp \
    ffmpeg \
    rubberband \
    curl

RUN npm install -g pnpm

# Stage 2: Build
FROM dependencies AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod false

COPY . .
RUN pnpm build

# Stage 3: Runtime
FROM alpine:3.21 AS runtime
RUN apk add --no-cache \
    nodejs \
    python3 \
    yt-dlp \
    ffmpeg \
    rubberband \
    curl \
    tini

WORKDIR /app

RUN addgroup -g 1000 node && adduser -D -u 1000 -G node node

COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/static ./static
COPY --from=build --chown=node:node /app/package.json .

RUN mkdir -p ./build/client/audio/transposed && chown -R node:node ./build/client/audio

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build"]

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:3000/ || exit 1
