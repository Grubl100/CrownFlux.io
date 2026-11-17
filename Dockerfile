# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.14.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment and synchronized port for Fly.io
ENV NODE_ENV="production"
ENV PORT="8080"
ENV HOST="0.0.0.0"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install node modules
COPY package.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Expose port 8080 synchronized with fly.toml internal_port
EXPOSE 8080
CMD [ "npm", "run", "start" ]
