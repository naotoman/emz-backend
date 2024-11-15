FROM node:20.17-alpine3.20

RUN npm install -g esbuild

WORKDIR /root/app

# COPY package*.json .
# RUN npm ci

COPY src/ .
RUN esbuild *.ts --outdir=. --target=es2022 --platform=node --format=cjs

CMD ["node", "index.js"]