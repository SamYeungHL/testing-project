# Use official Node LTS image
FROM node:18-bullseye-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

# Bundle app source
COPY . .

# Use a non-root user for better security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser || true
USER appuser

EXPOSE 8080
CMD ["node", "index.js"]
