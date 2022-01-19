# yjs-scalable-ws-backend

Example of horizontally scalable websocket backend for [y-js](https://github.com/yjs/yjs) to be used with [y-websocket](https://github.com/yjs/y-websocket) provider with persitence to firebase.

## Commands

`npm run start:development` - refresh on change, uses `.env.development`

---

`npm run start:production` - no refresh, uses `.env.production`

---

`npm run start:docker` - no refresh, uses `.env.docker`

---

`npm run image:build` - builds docker image

---

`npm run image:build:run` - builds then runs the docker image using `npm run start:docker`
## Usage

1. `npm ci`
2. `npm run build`
3. `cp .env.example .env.local`
4. `npm run dev` -> starts the websocket-server
5. On the client-side, initialize a yjs doc and use the y-websocket provider to connect to the websocket-server

## How it works

This repo is a slightly reworked websocket server found in the yjs-scalable-ws-backend repo([link](https://github.com/kapv89/yjs-scalable-ws-backend)) which is a slightly modified version of y-websocket repo([link](https://github.com/yjs/y-websocket/blob/master/bin/server.js)).

The websocket-server that comes with y-websocket essentially maintains a copy of the y-js document(s) in memory and syncs it between different clients connected to the same doc.

The websocket-server in this repo isolates the updates that clients send to it, persists these updates to the database, and publishes these updates (using redis-pubsub) in a channel for the document. Also, when a doc is created for the first time in the websocket-server, the server reads all the updates stored in the database, and applies those updates to the document, effectively initializing it.

This makes the websocket-server provided in this repo persistent and horizontally-scalable on paper.

The code in this repo hasn't been tested in a production system yet, and from the looks of it, will be a long time before I would be able to run it on a production system, but theoretically, the code in this repo should be sufficient and can be tweaked to suit any project.
