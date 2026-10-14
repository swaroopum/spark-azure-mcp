const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');

const app = express();

// CORS Permissions for Google Gemini/Spark
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// To read messages from Spark
app.use(express.json());

let mcpServer;
let transport;

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Azure MCP Server is running perfectly!');
});

// Official MCP SSE Initialization Endpoint
app.get('/mcp', async (req, res) => {
  try {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    
    if (!mcpServer) {
      mcpServer = new Server(
        { name: "spark-azure-mcp", version: "1.0.0" },
        { capabilities: {} }
      );
    }
    
    transport = new SSEServerTransport('/messages', res);
    await mcpServer.connect(transport);
  } catch (error) {
    console.error("MCP Setup Error:", error);
    res.status(500).send("MCP Error");
  }
});

// Message handler for Spark commands
app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Connection not established");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MCP Server listening on port ${port}`);
});
