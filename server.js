// Full-Featured Real-Time WebSocket Chat Server
// Run with: npm run server (or node server.js)
// Test in browser: Open http://localhost:8080 to test live chat with your mobile app!

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// 1. Create HTTP server to serve a built-in Web Chat Test Client
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getWebClientHTML());
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connectedClients: wss.clients.size }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// 2. Attach WebSocket server to HTTP server
const wss = new WebSocket.Server({ server });

let clientIdCounter = 1;

console.log(`=======================================================`);
console.log(` 🚀 WebSocket Chat Server is running on port ${PORT}`);
console.log(` 📱 Mobile WS URL: ws://localhost:${PORT} (or 10.0.2.2:8080 for Android)`);
console.log(` 💻 Web Test Client: http://localhost:${PORT}`);
console.log(`=======================================================`);

wss.on('connection', (ws, req) => {
  ws.clientId = `Client-${clientIdCounter++}`;
  ws.isAlive = true;

  console.log(`[+] [${ws.clientId}] Connected (Total active: ${wss.clients.size})`);

  // Send a welcome handshake to the newly connected client
  ws.send(
    JSON.stringify({
      type: 'system',
      message: 'Connected to WebSocket Chat Server',
      clientId: ws.clientId,
      activeClients: wss.clients.size,
    })
  );

  // Broadcast updated active client count to everyone
  broadcastSystemStatus();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const dataStr = raw.toString();
      let payload;

      try {
        payload = JSON.parse(dataStr);
      } catch (err) {
        payload = { type: 'message', text: dataStr };
      }

      console.log(`[Message from ${ws.clientId}]:`, payload.type || 'text', payload.text || (payload.image ? '[Photo]' : ''));

      // Case 1: Typing indicator
      if (payload.type === 'typing') {
        broadcastToOthers(ws, {
          type: 'typing',
          isTyping: Boolean(payload.isTyping),
          chatUserId: payload.chatUserId,
          senderName: payload.senderName || 'Peer',
        });
        return;
      }

      // Case 2: Standard Chat Message
      const messageToBroadcast = {
        type: 'message',
        id: payload.id || String(Date.now()),
        text: payload.text || '',
        image: payload.image || null,
        audio: payload.audio || null,
        duration: payload.duration || 0,
        sender: 'other',
        chatUserId: payload.chatUserId || null,
        senderName: payload.senderName || 'Contact',
        timestamp: payload.timestamp || Date.now(),
      };

      const otherClientsCount = getOtherClientsCount(ws);

      if (otherClientsCount > 0) {
        // Broadcast to all other connected clients (browser, other devices)
        broadcastToOthers(ws, messageToBroadcast);
      } else {
        // If only 1 client is connected (testing locally without peer),
        // simulate a realistic reply from the contact after 1 second!
        console.log(`[${ws.clientId}] is the only connected client. Triggering simulated reply...`);
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            let replyText = `Got your message: "${payload.text}" 👍`;
            if (payload.audio) {
              replyText = `Received your voice note! 🎙️ (${payload.duration || 1}s)`;
            } else if (payload.image) {
              replyText = 'Nice photo! 📸 Received via WebSocket.';
            }

            ws.send(
              JSON.stringify({
                type: 'message',
                id: String(Date.now() + 1),
                text: replyText,
                image: null,
                audio: null,
                sender: 'other',
                chatUserId: payload.chatUserId || null,
                senderName: payload.chatUserName || 'Contact',
                timestamp: Date.now(),
              })
            );
          }
        }, 1000);
      }
    } catch (error) {
      console.error(`[Error processing message from ${ws.clientId}]:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[-] [${ws.clientId}] Disconnected (Remaining: ${wss.clients.size})`);
    broadcastSystemStatus();
  });

  ws.on('error', (err) => {
    console.error(`[Error on ${ws.clientId}]:`, err.message);
  });
});

// Helper: Broadcast to all other connected clients
function broadcastToOthers(senderWs, payload) {
  const jsonStr = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  });
}

// Helper: Count other active clients
function getOtherClientsCount(senderWs) {
  let count = 0;
  wss.clients.forEach((client) => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      count++;
    }
  });
  return count;
}

// Helper: Broadcast system client count
function broadcastSystemStatus() {
  const payload = JSON.stringify({
    type: 'system_status',
    activeClients: wss.clients.size,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Keep-alive heartbeat: ping clients every 30 seconds
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start listening
server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

// Built-in Web Test Client HTML & JS
function getWebClientHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat App - WebSocket Test Console</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; display: flex; flex-direction: column; height: 100vh; }
    header { background: #007aff; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 18px; font-weight: 600; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; background: rgba(255,255,255,0.2); padding: 4px 10px; borderRadius: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4cd964; }
    .dot.offline { background: #ff3b30; }
    .container { max-width: 800px; width: 100%; margin: 20px auto; flex: 1; display: flex; flex-direction: column; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden; }
    .meta-bar { padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #eee; display: flex; gap: 12px; align-items: center; font-size: 14px; }
    .meta-bar select, .meta-bar input { padding: 6px 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 13px; }
    .messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .msg { max-width: 70%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.4; word-break: break-word; }
    .msg.sent { align-self: flex-end; background: #007aff; color: white; border-bottom-right-radius: 2px; }
    .msg.received { align-self: flex-start; background: #e5e5ea; color: #000; border-bottom-left-radius: 2px; }
    .msg.sys { align-self: center; background: #eee; color: #666; font-size: 12px; border-radius: 10px; }
    .msg img { max-width: 240px; max-height: 200px; border-radius: 8px; display: block; margin-bottom: 6px; }
    .sender-tag { font-size: 11px; opacity: 0.8; margin-bottom: 2px; font-weight: 600; }
    .typing-bar { padding: 4px 16px; font-size: 12px; color: #888; font-style: italic; min-height: 22px; }
    .composer { display: flex; padding: 12px; border-top: 1px solid #eee; background: white; gap: 8px; }
    .composer input { flex: 1; padding: 10px 14px; border-radius: 20px; border: 1px solid #ddd; outline: none; font-size: 14px; }
    .composer button { padding: 10px 20px; background: #007aff; color: white; border: none; border-radius: 20px; font-weight: 600; cursor: pointer; }
    .composer button:disabled { background: #b0c4de; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <h1>💬 WebSocket Live Test Console</h1>
    <div class="status-badge">
      <div id="statusDot" class="dot offline"></div>
      <span id="statusText">Connecting...</span>
      <span>•</span>
      <span id="clientCount">1 client</span>
    </div>
  </header>
  <div class="container">
    <div class="meta-bar">
      <span>Act as:</span>
      <input type="text" id="senderName" value="Web Tester" style="width: 120px;" />
      <span style="margin-left: auto; color: #666;">Messages sent here appear on your mobile app!</span>
    </div>
    <div id="messagesList" class="messages">
      <div class="msg sys">Welcome to WebSocket Test Console. Start typing below to test live chat.</div>
    </div>
    <div id="typingIndicator" class="typing-bar"></div>
    <form id="chatForm" class="composer">
      <input type="text" id="messageInput" placeholder="Type a message to your mobile app..." autocomplete="off" />
      <button type="submit" id="sendBtn">Send</button>
    </form>
  </div>
  <script>
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const clientCount = document.getElementById('clientCount');
    const messagesList = document.getElementById('messagesList');
    const typingIndicator = document.getElementById('typingIndicator');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const senderName = document.getElementById('senderName');

    let ws = null;
    let typingTimeout = null;

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host);

      ws.onopen = () => {
        statusDot.className = 'dot';
        statusText.textContent = 'Live Connected';
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'system_status') {
            clientCount.textContent = data.activeClients + (data.activeClients === 1 ? ' client' : ' clients');
            return;
          }
          if (data.type === 'system') {
            appendMessage('sys', data.message);
            return;
          }
          if (data.type === 'typing') {
            if (data.isTyping) {
              typingIndicator.textContent = (data.senderName || 'Peer') + ' is typing...';
            } else {
              typingIndicator.textContent = '';
            }
            return;
          }
          if (data.type === 'message' || data.text || data.image) {
            appendMessage('received', data.text, data.image, data.senderName || 'Mobile App');
          }
        } catch (e) {
          appendMessage('received', event.data, null, 'Raw Message');
        }
      };

      ws.onclose = () => {
        statusDot.className = 'dot offline';
        statusText.textContent = 'Disconnected (reconnecting...)';
        setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function appendMessage(type, text, image, sender) {
      const div = document.createElement('div');
      div.className = 'msg ' + type;
      if (sender && type === 'received') {
        const tag = document.createElement('div');
        tag.className = 'sender-tag';
        tag.textContent = sender;
        div.appendChild(tag);
      }
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        div.appendChild(img);
      }
      if (text) {
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        div.appendChild(textSpan);
      }
      messagesList.appendChild(div);
      messagesList.scrollTop = messagesList.scrollHeight;
    }

    messageInput.addEventListener('input', () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'typing', isTyping: true, senderName: senderName.value }));
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
        }, 1500);
      }
    });

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

      const payload = {
        type: 'message',
        id: String(Date.now()),
        text: text,
        sender: 'other',
        senderName: senderName.value.trim() || 'Web Tester',
        timestamp: Date.now()
      };

      ws.send(JSON.stringify(payload));
      appendMessage('sent', text, null, null);
      messageInput.value = '';
    });

    connect();
  </script>
</body>
</html>`;
}
