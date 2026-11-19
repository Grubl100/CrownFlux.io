# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.14.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app

ENV NODE_ENV="production"
ENV PORT="8080"
ENV HOST="0.0.0.0"

FROM base AS build

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build && npm prune --omit=dev

FROM base

COPY --from=build /app /app

EXPOSE 8080
CMD [ "npm", "run", "start" ]
