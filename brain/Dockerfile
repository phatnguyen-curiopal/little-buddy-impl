# Production image. The env comes from compose's env_file, so the npm
# scripts' --env-file=.env is bypassed and node is started directly.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
CMD ["node", "server.js"]
