# One image, two processes:
#   API:     docker run <image>                 (ROLE=api: migrate, then node src/main.ts)
#   Worker:  docker run -e ROLE=worker <image>  (node src/worker.ts)
# Staging: docker compose up (see docker-compose.yml).
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
# Full install: the Prisma and Better Auth CLIs (dev dependencies) migrate from this image.
RUN npm ci --ignore-scripts && npm rebuild esbuild
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
ENTRYPOINT ["./deploy/entrypoint.sh"]
