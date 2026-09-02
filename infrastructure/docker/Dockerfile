FROM node:22.20.0-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@shortfactory/api", "dev"]
