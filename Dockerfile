FROM node:22-bookworm
WORKDIR /app

# install using lockfile for reproducible builds
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
EXPOSE 3000
