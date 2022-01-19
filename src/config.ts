import { uuidv4 } from "lib0/random";

const config = {
  testing: process.env.JEST_WORKER_ID !== undefined,

  containerUniqueId: uuidv4(),

  server: {
    port: Number(process.env.SERVER_PORT),
    host: process.env.SERVER_HOST as string
  },

  firebaseMeta: {
    connectTo: (process.env.FIREBASE || 'LIVE') as 'LIVE' | 'EMULATOR',
    emulatorFirestoreHost: (process.env.FIREBASE_EMULATOR_FIRESTORE_HOST || 'localhost'),
    emulatorFirestorePort: (+process.env.FIREBASE_EMULATOR_FIRESTORE_PORT! || 8080),
  },

  firebaseConfig: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
  },

  redis: {
    host: process.env.REDIS_HOST as string,
    port: Number(process.env.REDIS_PORT as string),
    keyPrefix: process.env.REDIS_PREFIX as string
  },

  gcp: {
    projectId: process.env.GCP_PROJECT_ID as string,
  },

  pubsub: (process.env.PUBSUB_TYPE as 'GCP' | 'REDIS') || 'REDIS',
}

export default config;