const http = require('http');
const crypto = require('crypto');

/* ------The WebSockets Frame -----

0                   1                   2                   3
     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
    +-+-+-+-+-------+-+-------------+-------------------------------+
    |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
    |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
    |N|V|V|V|       |S|             |   (if payload len==126/127)   |
    | |1|2|3|       |K|             |                               |
    +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
    |     Extended payload length continued, if payload len == 127  |
    + - - - - - - - - - - - - - - - +-------------------------------+
    |                               |Masking-key, if MASK set to 1  |
    +-------------------------------+-------------------------------+
    | Masking-key (continued)       |          Payload Data         |
    +-------------------------------- - - - - - - - - - - - - - - - +
    :                     Payload Data continued ...                :
    + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
    |                     Payload Data continued ...                |
    +---------------------------------------------------------------+

*/

//the websockets opcodes
const OPC = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end('Use WebSocket upgrade!');
});

server.on('upgrade', (req, socket, head) => {
  // Basic handshake checks
  const upgrade = (req.headers.upgrade || '').toLowerCase();
  const connection = (req.headers.connection || '').toLowerCase();
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  const ok =
    upgrade === 'websocket' &&
    connection.split(/,\s*/).includes('upgrade') &&
    key && version === '13';
  if (!ok) {
    //raw tcp socket
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  // Compute Sec-WebSocket-Accept
  const accept = crypto
    .createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');
  // Complete the upgrade
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocolssss',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ];
  socket.write(responseHeaders.join('\r\n'));
  socket.setNoDelay(true);

  // If there were leftover bytes from the HTTP parser (head), prepend them
  let leftover = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let textBuf = null;

  const onBytes = (chunk) => {

    //whatever we had of leftover concat it, could be partial frame
    chunk = Buffer.concat([leftover, chunk]);

    console.log(chunk);          // raw bytes buffer
    console.log(chunk.toString('hex')); // hex representation
    const hexString = chunk.toString('hex'); // "81831e9d57cd76f43e"
    const hexArray = hexString.match(/.{2}/g).map(b => '0x' + b);
    console.log(hexArray);

    let off = 0;                                        // off pointing to 1st Byte
    const fin = (chunk[off] & 0x80) !== 0;
    const opcode = chunk[off] & 0x0f;
    off += 1;                                           // off pointing to 2nd Byte

    const mask = (chunk[off] & 0x80) !== 0;
    const payloadLen = chunk[off] & 0x7f;
    off += 1;                                           // off pointing to Mask key or payload

    let maskKey;
    if (mask) {
      maskKey = [chunk[2], chunk[3], chunk[4], chunk[5]];
      console.log("maskKey: ", maskKey);
      off += 4;                                        // off pointing to 6th Byte
    }
    const payload = chunk.subarray(off, off + payloadLen); // subarray of payload
    if (mask) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] = payload[i] ^ maskKey[i % 4];
      }
    }
    const output = payload.toString(); // convert Buffer to string
    console.log("Payload:", output);

    const frame = { "fin": fin, "opcode": opcode, "payload": payload };
    console.log("frame: ", frame);

    onFrame(frame);

    off += payloadLen; // there maybe more frames
  }

  //building a frame so we can send it to the client
  function buildFrame({ opcode, payload = Buffer.alloc(0), fin = true }) {
    const first = (fin ? 0x80 : 0x00) | (opcode & 0x0f);
    const len = payload.length;
    if (len < 126) {
      return Buffer.concat([Buffer.from([first, len]), payload]); // server frames unmasked
    } else if (len <= 0xffff) {
      const h = Buffer.alloc(4);
      h[0] = first;
      h[1] = 126;
      h.writeUInt16BE(len, 2);
      return Buffer.concat([h, payload]);
    } else {
      const h = Buffer.alloc(10);
      h[0] = first;
      h[1] = 127;
      h.writeUInt32BE(0, 2);
      h.writeUInt32BE(len, 6);
      return Buffer.concat([h, payload]);
    }
  }

  //declare send function
  const send = (opcode, payload) => socket.write(buildFrame({ "opcode": opcode, "payload": payload }));

  const onFrame = (wsframe) => {

    switch (wsframe.opcode) {

      case OPC.TEXT: {
        textBuf = textBuf ? Buffer.concat([textBuf, wsframe.payload]) : wsframe.payload;
        if (wsframe.fin) {
          let msg = textBuf.toString('utf8');
          console.log(`[client TEXT] ${msg}`);      // 👈 plain text received
          if(msg === "hii" || msg == "hi") {
            msg = "hello";
          }
          send(OPC.TEXT, Buffer.from(msg, 'utf8')); // echo back
          textBuf = null;
        }
        break;
      }
      case OPC.CONT: {
        if (!textBuf) textBuf = Buffer.alloc(0);
        textBuf = Buffer.concat([textBuf, wsframe.payload]);
        if (fin) {
          const msg = textBuf.toString('utf8');
          console.log(`[client TEXT] ${msg}`);
          send(OPC.TEXT, Buffer.from(msg, 'utf8'));
          textBuf = null;
        }
        break;
      }
      case OPC.BIN:
        console.log(`[client BIN] ${wsframe.payload.length} bytes`);
        send(OPC.BIN, wsframe.payload); // optional echo
        break;
      case OPC.PING:
        send(OPC.PONG, wsframe.payload);
        break;
      case OPC.CLOSE:
        // Echo CLOSE and end TCP socket
        socket.write(buildFrame({ "opcode": OPC.CLOSE, "payload": wsframe.payload }));
        socket.end();
        break;
      default:
        // ignore reserved/unknown
        break;
    }
  }

  if (leftover.length) onBytes(Buffer.alloc(0)); // process initial leftover if any

  socket.on('data', onBytes);
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`HTTP/1.1 WS server on ws://localhost:${PORT}`);
});
