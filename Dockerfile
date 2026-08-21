FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY knexfile.js ./
COPY migrations/ ./migrations/
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p data logs

EXPOSE 8765

ENV PORT=8765
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
