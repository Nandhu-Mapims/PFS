FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Runtime writes go to /app/uploads (Docker volume). Bundle repo files separately for seeding.
RUN if [ -d uploads ]; then mv uploads uploads-bundled; fi \
  && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
