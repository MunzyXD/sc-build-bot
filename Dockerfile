FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/data
VOLUME ["/app/data"]
CMD ["npm", "start"]
