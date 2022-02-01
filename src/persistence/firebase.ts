import { initializeApp } from "firebase/app";
import { Timestamp, Bytes, doc, collection, getFirestore, getDocs, addDoc, setDoc, getDoc, query, orderBy, startAfter, connectFirestoreEmulator } from "firebase/firestore";
import config from "../config";

initializeApp(config.firebaseConfig);
const db = getFirestore();

if (config.firebaseMeta.connectTo === 'EMULATOR') {
  connectFirestoreEmulator(
    db,
    config.firebaseMeta.emulatorFirestoreHost,
    config.firebaseMeta.emulatorFirestorePort,
  );
}

export { db };

const docnameItemsRef = (docName: string) => collection(db, `meetings_yjs/${docName}/items`);
const docnameCompilation = (docName: string) => doc(db, `meetings_yjs/${docName}`);

export { docnameItemsRef };
export { docnameCompilation };