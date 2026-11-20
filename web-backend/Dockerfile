FROM node:24-slim

ENV NODE_ENV=production \
    AUTHENTISCAN_DATA_MODE=cloud-hybrid \
    AUTHENTISCAN_CLOUDINARY_CONFIG_PATH=/secrets/cloudinary.json \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
USER node

CMD ["node", "scripts/serve-production-api.mjs"]
