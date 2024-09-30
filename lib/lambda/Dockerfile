FROM node:20.17-alpine3.20

ARG lambda

RUN npm install -g esbuild

WORKDIR /asset

COPY common/src/ common/
RUN esbuild common/*.ts --outdir=common/ --target=es2022 --platform=node --format=cjs

COPY ${lambda}/package*.json .
RUN npm ci --omit=dev

COPY ${lambda}/src .
RUN esbuild *.ts --outdir=. --target=es2022 --platform=node --format=cjs
