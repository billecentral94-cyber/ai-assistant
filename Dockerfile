FROM node:20-alpine

WORKDIR /app

# Copy root dependencies and app dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm install
RUN cd apps/api && npm install
RUN cd apps/web && npm install

# Copy source code
COPY . .

# Build web frontend and API typescript
RUN cd apps/web && npm run build
RUN cd apps/api && npm run build

EXPOSE 4000

ENV NODE_ENV=production

# Start combined API server (serves API & static Web UI)
CMD ["sh", "-c", "cd apps/api && npm run start"]
