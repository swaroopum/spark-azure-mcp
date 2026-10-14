const express = require('express');
const app = express();

// Allow all connections
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.use(express.json());

let mcpServer;
let transport;

app.get('/', (req, res) => {
  res.send('Server is Running!');
});

// New Simplified Endpoint
app.get('/sse', async (req, res) => {
  try {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    
    if (!mcpServer) {
      mcpServer = new Server({ name: "spark-azure", version: "1.0.0" }, { capabilities: {} });
    }
    
    transport = new SSEServerTransport('/messages', res);
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
