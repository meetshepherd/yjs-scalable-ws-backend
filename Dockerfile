FROM node:17

WORKDIR /usr/app

COPY ["./package.json", "package-lock.json", "./"]

RUN npm install

COPY ./ ./

RUN npm run build

CMD ["npm", "run", "start:docker"]
