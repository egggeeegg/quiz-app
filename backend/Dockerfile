FROM node:20-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY package.json package-lock.json* ./
RUN npm install --production
COPY src/ ./src/
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["node", "src/index.js"]