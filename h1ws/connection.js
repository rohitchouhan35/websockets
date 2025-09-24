// connection.js
const { OPC, parseFrame, buildFrame } = require('./frame');
const allSockets = new Set();

class WebSocketConnection {
  constructor(socket) {
    this.socket = socket;
    allSockets.add(socket);
    this.textBuf = null;

    socket.on('data', (chunk) => this.onBytes(chunk));
    socket.on('close', () => console.log('[socket closed]'));
  }

  send(opcode, data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    allSockets.forEach(s => {
      if (s !== this.socket && opcode === OPC.TEXT) {
        s.write(buildFrame({ opcode, payload: buf }));
      }
    });
    this.socket.write(buildFrame({ opcode, payload: buf }));
  }

  onBytes(chunk) {
    try {
      const frame = parseFrame(chunk);
      this.onFrame(frame);
    } catch (e) {
      console.error('Frame parse error', e);
    }
  }

  onFrame(frame) {
    switch (frame.opcode) {
      case OPC.TEXT:
        this.textBuf = this.textBuf
          ? Buffer.concat([this.textBuf, frame.payload])
          : frame.payload;
        if (frame.fin) {
          let msg = this.textBuf.toString('utf8');
          console.log(`[client TEXT] ${msg}`);

          // business logic (customize)
          if (msg === 'hii' || msg === 'hi') msg = 'hello';

          this.send(OPC.TEXT, msg);
          this.textBuf = null;
        }
        break;

      case OPC.BIN:
        console.log(`[client BIN] ${frame.payload.length} bytes`);
        this.send(OPC.BIN, frame.payload);
        break;

      case OPC.PING:
        this.send(OPC.PONG, frame.payload);
        break;

      case OPC.CLOSE:
        this.send(OPC.CLOSE, frame.payload);
        this.socket.end();
        break;

      default:
        console.log(`[unhandled opcode] ${frame.opcode}`);
        break;
    }
  }
}

module.exports = WebSocketConnection;
