const express = require('express');
const app = express();

app.use(express.json());

// Advanced CORS for Gemini
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("X-Accel-Buffering", "no");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

let mcpServer;
let transport;

app.get('/', (req, res) => {
  res.send('Server is Running!');
});

app.get('/sse', async (req, res) => {
  try {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    
    if (!mcpServer) {
      mcpServer = new Server({ name: "spark-azure", version: "1.0.0" }, { capabilities: {} });
    }
    
    // IMPORTANT FIX: Give Gemini the FULL URL, not just '/messages'
    const fullMessagesUrl = `https://${req.headers.host}/messages`;
    transport = new SSEServerTransport(fullMessagesUrl, res);
    
    await mcpServer.connect(transport);
  } catch (error) {
    res.status(500).send("Error");
  }
});

app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Not connected");
  }
});

app.listen(process.env.PORT || 8080, () => console.log('Ready'));
