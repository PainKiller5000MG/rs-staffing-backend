# One image, two processes:
#   API:     docker run <image>                      (node src/main.ts)
#   Worker:  docker run <image> node src/worker.ts
#   Migrate: docker run <image> npm run db:migrate   (release step, before rollout)
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
# Full install: the Prisma CLI (a dev dependency) runs migrations from this image.
RUN npm ci --ignore-scripts
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/main.ts"]
