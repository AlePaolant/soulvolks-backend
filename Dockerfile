FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/database ./database
COPY --from=builder /app/public ./public
COPY --from=builder /app/favicon.png ./favicon.png
RUN ln -s /app/dist/config /app/config && \
    mkdir -p /app/node_modules/@strapi/admin/dist/server/server && \
    ln -s /app/dist/build /app/node_modules/@strapi/admin/dist/server/server/build
USER appuser
EXPOSE 1337
CMD ["node", "-e", "require('@strapi/strapi').createStrapi({appDir:'/app',distDir:'/app/dist'}).start()"]
