const express = require("express");
const { DefaultAzureCredential } = require("@azure/identity");
const { ComputeManagementClient } = require("@azure/arm-compute");
const { ResourceManagementClient } = require("@azure/arm-resources");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8080);
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!SUBSCRIPTION_ID) {
  console.error("Missing required App Setting: AZURE_SUBSCRIPTION_ID");
}
if (!MCP_API_KEY) {
  console.error("Missing required App Setting: MCP_API_KEY. Refusing to start without endpoint authentication.");
  process.exit(1);
}

const credential = new DefaultAzureCredential();
const computeClient = SUBSCRIPTION_ID
  ? new ComputeManagementClient(credential, SUBSCRIPTION_ID)
  : null;
const resourceClient = SUBSCRIPTION_ID
  ? new ResourceManagementClient(credential, SUBSCRIPTION_ID)
  : null;

app.get("/", (_req, res) => {
  res.status(200).send("Azure MCP server is running.");
});

// Keep the MCP endpoint protected. Configure the same API key in Gemini Spark's
// connection authentication settings if that client supports a custom bearer token.
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || supplied.length !== MCP_API_KEY.length ||
      !require("crypto").timingSafeEqual(Buffer.from(supplied), Buffer.from(MCP_API_KEY))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function createMcpServer() {
  const server = new McpServer({
    name: "spark-azure-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "azure_list_resource_groups",
    {
      title: "List Azure Resource Groups",
      description: "Lists resource groups in the configured Azure subscription.",
      inputSchema: {}
    },
    async () => {
      const groups = [];
      for await (const group of resourceClient.resourceGroups.list()) {
        groups.push({
          name: group.name,
          location: group.location,
          id: group.id,
          provisioningState: group.properties?.provisioningState
        });
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          subscriptionId: SUBSCRIPTION_ID,
          count: groups.length,
          resourceGroups: groups
        }, null, 2) }]
      };
    }
  );

  server.registerTool(
    "azure_list_virtual_machines",
    {
      title: "List Azure Virtual Machines",
      description: "Lists virtual machines in the configured Azure subscription.",
      inputSchema: {
        resourceGroupName: z.string().optional().describe(
          "Optional resource group name. If omitted, list VMs across the subscription."
        )
      }
    },
    async ({ resourceGroupName }) => {
      const vms = [];
      const iterator = resourceGroupName
        ? computeClient.virtualMachines.list(resourceGroupName)
        : computeClient.virtualMachines.listAll();

      for await (const vm of iterator) {
        vms.push({
          name: vm.name,
          id: vm.id,
          location: vm.location,
          resourceGroup: vm.id?.split("/resourceGroups/")[1]?.split("/")[0],
          vmSize: vm.hardwareProfile?.vmSize,
          provisioningState: vm.provisioningState,
          powerState: vm.instanceView?.statuses?.find(s => s.code?.startsWith("PowerState/"))?.displayStatus
        });
      }

      return {
        content: [{ type: "text", text: JSON.stringify({
          subscriptionId: SUBSCRIPTION_ID,
          count: vms.length,
          virtualMachines: vms
        }, null, 2) }]
      };
    }
  );

  server.registerTool(
    "azure_get_virtual_machine",
    {
      title: "Get Azure Virtual Machine",
      description: "Gets details for one virtual machine. Does not modify the VM.",
      inputSchema: {
        resourceGroupName: z.string().min(1),
        vmName: z.string().min(1)
      }
    },
    async ({ resourceGroupName, vmName }) => {
      const vm = await computeClient.virtualMachines.get(resourceGroupName, vmName);
      return {
        content: [{ type: "text", text: JSON.stringify({
          name: vm.name,
          id: vm.id,
          location: vm.location,
          resourceGroup: resourceGroupName,
          vmSize: vm.hardwareProfile?.vmSize,
          provisioningState: vm.provisioningState,
          osType: vm.storageProfile?.osDisk?.osType,
          tags: vm.tags || {}
        }, null, 2) }]
      };
    }
  );

  return server;
}

// Stateless Streamable HTTP: one MCP server/transport per POST request.
// This endpoint exposes read-only Azure tools only.
app.post("/mcp", authenticate, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.set("Allow", "POST");
  res.status(405).send("MCP endpoint expects POST requests.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Azure MCP server listening on port ${PORT}`);
});
