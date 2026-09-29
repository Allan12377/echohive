FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci
COPY packages/db/prisma ./packages/db/prisma
RUN npm run db:generate --workspace=@echohive/db

FROM dependencies AS api-build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN npm run build --workspace=@echohive/api

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY package.json ./package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/db/prisma ./packages/db/prisma
EXPOSE 4000
CMD ["sh", "-c", "npm run db:deploy --workspace=@echohive/db && npm run start --workspace=@echohive/api"]

FROM dependencies AS web-build
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
RUN npm run build --workspace=@echohive/web

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

