FROM node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY db ./db
COPY web ./web
COPY scripts ./scripts

RUN npm run build:prod

FROM node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS runtime

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000

WORKDIR /app

# Keep npm/yarn/corepack and their transitive packages out of the runtime image.
# The Node binary is copied from the exact toolchain image; Alpine supplies only
# its runtime C++ dependency and receives current security fixes before shipping.
RUN apk upgrade --no-cache \
    && apk add --no-cache libstdc++ \
    && addgroup -S loto \
    && adduser -S -G loto loto

COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/web-dist ./web-dist

USER loto

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/src/cli/apiStart.js"]
