FROM public.ecr.aws/amazonlinux/amazonlinux:2023

ARG lambda

RUN dnf install -y nodejs20 nodejs20-npm &&\ 
alternatives --install /usr/bin/node node /usr/bin/node-20 90 &&\
alternatives --install /usr/bin/npm npm /usr/bin/npm-20 90 &&\
npm install -g esbuild

WORKDIR /asset

COPY common/src/ common/
RUN esbuild common/*.ts --outdir=common/ --target=es2022 --platform=node --format=cjs

COPY ${lambda}/package*.json .
RUN npm ci --omit=dev

COPY ${lambda}/src .
RUN esbuild *.ts --outdir=. --target=es2022 --platform=node --format=cjs
