// frame.js
const OPC = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

function parseFrame(buffer) {
  let off = 0;
  const fin = (buffer[off] & 0x80) !== 0;
  const opcode = buffer[off] & 0x0f;
  off += 1;

  const mask = (buffer[off] & 0x80) !== 0;
  let payloadLen = buffer[off] & 0x7f;
  off += 1;

  if (payloadLen === 126) {
    payloadLen = buffer.readUInt16BE(off);
    off += 2;
  } else if (payloadLen === 127) {
    // only support smaller payloads for simplicity
    throw new Error("Large payloads not supported in this demo");
  }

  let maskKey;
  if (mask) {
    maskKey = buffer.subarray(off, off + 4);
    off += 4;
  }

  let payload = buffer.subarray(off, off + payloadLen);
  if (mask) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return { fin, opcode, payload };
}

function buildFrame({ opcode, payload = Buffer.alloc(0), fin = true }) {
  const first = (fin ? 0x80 : 0x00) | (opcode & 0x0f);
  const len = payload.length;

  if (len < 126) {
    return Buffer.concat([Buffer.from([first, len]), payload]);
  } else if (len <= 0xffff) {
    const h = Buffer.alloc(4);
    h[0] = first; h[1] = 126; h.writeUInt16BE(len, 2);
    return Buffer.concat([h, payload]);
  } else {
    const h = Buffer.alloc(10);
    h[0] = first; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6);
    return Buffer.concat([h, payload]);
  }
}

module.exports = { OPC, parseFrame, buildFrame };
