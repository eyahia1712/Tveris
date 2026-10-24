# Tveris: one container, deployable to Google Cloud Run (or any container host).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV TVERIS_STANDALONE=1
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
# Standalone server + static assets + the sample inbox and its processed snapshot.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/data ./data
RUN mkdir -p /app/.tveris && chown -R node:node /app/.tveris
USER node
EXPOSE 8080
CMD ["node", "server.js"]
