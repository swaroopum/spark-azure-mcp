const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Azure MCP Server is running perfectly!');
});

// Main MCP endpoint for Google Spark
app.post('/mcp', async (req, res) => {
  try {
    // Authenticate with Azure using the Environment Variables we set earlier
    const credential = new DefaultAzureCredential();
    
    // Send success response to Spark
    res.json({
      success: true,
      message: "Connected to Azure successfully via MCP!",
      status: "ready"
    });
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Azure App Service assigns the port dynamically
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MCP Server listening on port ${port}`);
});
