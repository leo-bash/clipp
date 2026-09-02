FROM node:20.19-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY . .
RUN pnpm install --no-frozen-lockfile

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@shortfactory/api", "dev"]
