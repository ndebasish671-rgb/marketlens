FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DEPLOYMENT=true \
    TRUST_PROXY_HOPS=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# API-only image: the frontend is published separately to GitHub Pages.
COPY server.js ./server.js
COPY shared ./shared

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
