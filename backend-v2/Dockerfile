# Production image. Node runs the TypeScript sources directly (type
# stripping needs Node 23.6 or newer), so there is no build step. One image
# serves the Parent API, the voice service and the worker; compose picks the
# command. The env comes from compose's env_file.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
USER node
CMD ["node", "src/bin/api.ts"]
