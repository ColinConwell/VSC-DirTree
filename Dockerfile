FROM node:22-bookworm-slim
WORKDIR /opt/dirtree
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 DIRTREE_TEST_CACHE=/var/cache/dirtree/vscode-web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "scripts/dev.mjs"]
