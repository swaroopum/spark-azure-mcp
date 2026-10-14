const express = require('express');
const app = express();

app.use(express.json());

// Advanced CORS
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

app.get('/', (req, res) => {
  res.send('Server is Running!');
});

// Store multiple connections
const transports = new Map();

app.get('/sse', async (req, res) => {
  try {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    
    // Create a NEW server instance for every single connection
    const mcpServer = new Server({ name: "spark-azure", version: "1.0.0" }, { capabilities: {} });
    
    const fullMessagesUrl = `https://${req.headers.host}/messages`;
    const transport = new SSEServerTransport(fullMessagesUrl, res);
    
    await mcpServer.connect(transport);
    
    // Save the connection session
    transports.set(transport.sessionId, transport);
    
    // Remove connection when closed
    res.on('close', () => {
      transports.delete(transport.sessionId);
    });

  } catch (error) {
    console.error("SSE Error:", error);
    res.status(500).send("Error");
  }
});

app.post('/messages', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const transport = transports.get(sessionId);
    
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(404).send("Session not found");
    }
  } catch (error) {
    console.error("Message Error:", error);
    res.status(500).send("Error");
  }
});

app.listen(process.env.PORT || 8080, () => console.log('Ready'));
