FROM node:22-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm --prefix backend ci

COPY backend/prisma ./backend/prisma
# Client generation validates the datasource URL but does not connect to it.
# Docker Compose replaces this with the runtime database URL.
ENV DATABASE_URL=postgresql://newtonite:newtonite_dev_only@db:5432/newtonite
RUN npm --prefix backend run prisma:generate

COPY backend ./backend

WORKDIR /app/backend

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD node -e "fetch('http://localhost:3001/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "npm run prisma:migrate && npm run db:seed && npm run start"]
