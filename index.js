const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');

const app = express();

let mcpServer;
let transport;

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Azure MCP Server is running perfectly!');
});

// Official MCP SSE Initialization Endpoint for Google Spark
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
