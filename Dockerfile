# Yori Proxy Checker — production image
FROM node:22-bookworm-slim AS build
WORKDIR /app

# .npmrc sets ignore-scripts so better-sqlite3 13 uses its bundled prebuild
# instead of node-gyp (bookworm-slim has no Python or compiler).
COPY package*.json .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
