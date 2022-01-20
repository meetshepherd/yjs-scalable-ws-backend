import { WebSocket, Data as WSData } from 'ws';
import http from 'http';
import { Timestamp, Bytes, getDocs, addDoc, setDoc, getDoc, query, orderBy, startAfter } from "firebase/firestore";
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as mutex from 'lib0/mutex';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { serverLogger } from './logger/index';
import config from './config';
import makePubSub from './pubsub/index';
import { XMLParser } from 'fast-xml-parser';
import { docnameItemsRef, docnameCompilation } from './persistence/firebase';

const PUBSUB = makePubSub();

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2 // eslint-disable-line
const wsReadyStateClosed = 3 // eslint-disable-line

const updatesLimit = 50;

export interface DBUpdate {
  id: string;
  docname: string;
  update: Uint8Array;
}

export const messageSync = 0;
export const messageAwareness = 1;

export const pingTimeout = 30000;

export const docs = new Map<string, WSSharedDoc>();

export function cleanup() {
  docs.forEach((doc) => {
    doc.conns.forEach((_, conn) => {
      closeConn(doc, conn);
    })
  })
}

type TimestampedYDoc = [Y.Doc, Timestamp | null];

interface CompiledYDoc {
  text: string,
  checkpoint: Bytes,
  timestamp: Timestamp,
}

/**
 * Construct a YDoc based on previous content.
 * @param docName Document name
 * @returns The previous YDoc and its timestamp, or a new doc with no timestamp
 */
const previousYDoc = async (docName: string): Promise<TimestampedYDoc> => {
  const dbYDoc = new Y.Doc();
  let timestamp: Timestamp | null = null;
  const docSnap = await getDoc(docnameCompilation(docName));
  if (docSnap.exists()) {
    const docData = docSnap.data();
    if (docData.checkpoint && docData.timestamp) {
      timestamp = docData.timestamp;
      dbYDoc.transact(() => {
        Y.applyUpdate(dbYDoc, docData.checkpoint.toUint8Array());
      });
    }
  }
  return [dbYDoc, timestamp];
}

/**
 * Construct the complete YDoc
 * @param docName Document name
 * @returns The YDoc that contains all the document's content up until 'now'
 */
const constructNewYDoc = async (docName: string): Promise<TimestampedYDoc> => {
  const timestampQuery = (timestamp: Timestamp | null) => {
    if (timestamp)
      return query(docnameItemsRef(docName), orderBy('timestamp'), startAfter(timestamp));
    return query(docnameItemsRef(docName), orderBy('timestamp'));
  }
  const [dbYDoc, timestamp] = await previousYDoc(docName);
  let lastTimestamp: Timestamp | null = timestamp; // last timestamp recorded for the creation of this document

  const querySnapshot = await getDocs(timestampQuery(timestamp));
  dbYDoc.transact(() => {
    querySnapshot.forEach((item) => {
      const data = item.data() as {
        timestamp: Timestamp,
        update: Bytes,
      };
      Y.applyUpdate(dbYDoc, data.update.toUint8Array());
      lastTimestamp = data.timestamp;
    });
  });

  return [dbYDoc, lastTimestamp];
}

const compileYDoc = async (docName: string): Promise<CompiledYDoc> => {
  const [dbYDoc, lastTimestamp] = await constructNewYDoc(docName);
  return {
    text: await constructIndexableText(dbYDoc),
    checkpoint: Bytes.fromUint8Array(
      Y.encodeStateAsUpdate(dbYDoc),
    ),
    timestamp: lastTimestamp ?? Timestamp.fromDate(new Date()),
  };  
}

export default async function setupWSConnection(conn: WebSocket, req: http.IncomingMessage): Promise<void> {
  conn.binaryType = 'arraybuffer';
  const docname: string = req.url?.slice(1).split('?')[0] as string;
  const [doc, isNew] = getYDoc(docname);

  doc.conns.set(conn, new Set());

  conn.on('message', (message: WSData) => {
    messageListener(conn, req, doc, new Uint8Array(message as ArrayBuffer));
  });

  if (isNew) {
    const [dbYDoc, lastTimestamp] = await constructNewYDoc(doc.name);
    serverLogger.warn(`New from last checkpoint: ${lastTimestamp?.toDate().toISOString()}`);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(dbYDoc))
  }

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (e) {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', async () => {
    await setDoc(
      docnameCompilation(doc.name),
      await compileYDoc(doc.name),
      { merge: true }
    );

    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  // put the following in a variables in a block so the interval handlers don't keep them in
  // scope
  {
    // send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
      send(doc, conn, encoding.toUint8Array(encoder));      
    }
  }
}

export const messageListener = async (conn: WebSocket, req: http.IncomingMessage, doc: WSSharedDoc, message: Uint8Array): Promise<void> => {
  // TODO: authenticate request
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync: {
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
      
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
  
      break;
    }
    case messageAwareness: {
      const decodedUpdate = decoding.readVarUint8Array(decoder)
      awarenessProtocol.applyAwarenessUpdate(doc.awareness, decodedUpdate, conn);
      PUBSUB.publish(`aws_${doc.name}`, decodedUpdate);
      break;
    }
    default: throw new Error('unreachable');
  }
}

export const getYDoc = (docname: string, gc=true): [WSSharedDoc, boolean] => {
  const existing = docs.get(docname);
  if (existing) {
    return [existing, false];
  }

  const doc = new WSSharedDoc(docname);
  doc.gc = gc;

  docs.set(docname, doc);

  return [doc, true];
}

const mapXMLNodeToText = (node: any, parent: string): string => {
  let str = '';
  // block of nodes
  if (Array.isArray(node)) {
    // array of nodes
    node.forEach((n) => {
      str = `${str}${mapXMLNodeToText(n, parent)}`;
    });
    // finished parsing block, add artificial whitespace for some tags
    // TODO complete list with the remaining tags
    const whitespaceList = ['paragraph', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th'];
    if (whitespaceList.find((tag) => tag === parent)) {
      str = `${str} `;
    }
  }
  // directly text
  else if (typeof node === 'string') {
    // i don't think this can ever happen
    str = `${str}${node}`;
  }
  // this is a sort of node as well, but can sometimes only contain text
  else if (typeof node === 'object') {
    // this is an object, check the "#text" property and continue with other properties which can be other nodes
    Object.entries(node).forEach(([key, value]) => {
      if (key == '#text' && value && typeof value === 'string') {
        str = `${str}${value}`;
      }
      else {
        // new parent
        str = `${str}${mapXMLNodeToText(value, key)}`;
      }
    });
  }
  return str;
}

const constructIndexableText = async (doc: Y.Doc): Promise<string> => {
  let xml = doc.getXmlFragment('prosemirror');
  const parser = new XMLParser({
    ignoreAttributes: true,
    alwaysCreateTextNode: true,
    preserveOrder: true,
    trimValues: false,
    // no unpaired tags
  });
  const content = parser.parse(JSON.stringify(xml).slice(1,-1));
  const reducedToString = mapXMLNodeToText(content, '#root');

  return reducedToString;
};

export const closeConn = (doc: WSSharedDoc, conn: WebSocket): void => {
  const controlledIds = doc.conns.get(conn);
  if (controlledIds) {
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    
    if (doc.conns.size == 0) {
      doc.destroy();
      docs.delete(doc.name);
    }
  }

  conn.close();
}

export const send = (doc: WSSharedDoc, conn: WebSocket, m: Uint8Array): void => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
  }

  try {
    conn.send(m, err => {
      if (err) {
        closeConn(doc, conn);
      }
    });
  } catch (e) {
    closeConn(doc, conn);
  }
}

export const updateHandler = async (update: Uint8Array, origin: any, doc: WSSharedDoc): Promise<void> => {
  let shouldPersist = false;

  if (origin instanceof WebSocket && doc.conns.has(origin)) {
    PUBSUB.publish(doc.name, update);
    // pub.publishBuffer(doc.name, Buffer.from(update)); // do not await
    shouldPersist = true;
  }

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));

  if (shouldPersist) {
    await addDoc(docnameItemsRef(doc.name), {
      update: Bytes.fromUint8Array(update),
      timestamp: Timestamp.fromDate(new Date()),
    });
  }
}

export class WSSharedDoc extends Y.Doc {
  name: string;
  mux: mutex.mutex;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super();


    this.name = name;
    this.mux = mutex.createMutex();
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);

    const awarenessChangeHandler = ({added, updated, removed}: {added: number[], updated: number[], removed: number[]}, conn: WebSocket) => {
      const changedClients = added.concat(updated, removed);
      if (conn) {
        const connControlledIds = this.conns.get(conn);
        added.forEach(clientId => { connControlledIds?.add(clientId); });
        removed.forEach(clientId => { connControlledIds?.delete(clientId); });
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    }

    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);

    PUBSUB.subscribe(this.name, (update, sub) => {
      Y.applyUpdate(this, update, sub);
    });

    PUBSUB.subscribe(`aws_${this.name}`, (update, sub) => {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        update,
        undefined,
      );
    });
  }

  destroy() {
    super.destroy();
    PUBSUB.unsubscribe(this.name);
  }
}