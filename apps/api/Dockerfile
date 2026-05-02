FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache libstdc++

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 4101

CMD ["npm", "start"]
