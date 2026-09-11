//! MCP Host Library
//!
//! Manages MCP server child processes and routes tool calls to them.
//! The host spawns MCP servers as child processes communicating via stdio
//! using the JSON-RPC 2.0 protocol (per the MCP specification).

pub mod process;
pub mod protocol;

use anyhow::{anyhow, Result};
use std::collections::HashMap;
use tracing::{info, warn};

use process::McpServerProcess;
use protocol::ToolInfo;

/// Manages multiple MCP server processes and routes tool calls to them.
pub struct McpHost {
    servers: HashMap<String, McpServerProcess>,
}

impl McpHost {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }

    /// Register and spawn an MCP server process.
    ///
    /// The server is started as a child process with the given command and arguments.
    /// Communication happens via stdin/stdout using JSON-RPC 2.0.
    pub async fn register_server(
        &mut self,
        name: &str,
        command: &str,
        args: &[String],
    ) -> Result<()> {
        info!(name, command, "Registering MCP server");

        let process = McpServerProcess::spawn(name, command, args).await?;
        self.servers.insert(name.to_string(), process);

        info!(name, "MCP server registered and running");
        Ok(())
    }

    /// List all tools across all registered MCP servers.
    pub async fn list_tools(&self) -> Vec<ToolInfo> {
        let mut tools = Vec::new();
        for (server_name, process) in &self.servers {
            match process.list_tools().await {
                Ok(server_tools) => tools.extend(server_tools),
                Err(e) => {
                    warn!(
                        server = server_name.as_str(),
                        error = %e,
                        "Failed to list tools from MCP server"
                    );
                }
            }
        }
        tools
    }

    /// Call a tool on a specific MCP server by name.
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let process = self.servers.get(server_name).ok_or_else(|| {
            anyhow!("MCP server '{}' not registered", server_name)
        })?;

        process.call_tool(tool_name, args).await
    }

    /// Shut down all MCP server processes.
    pub async fn shutdown(&mut self) {
        for (name, process) in self.servers.drain() {
            info!(name = name.as_str(), "Shutting down MCP server");
            process.shutdown().await;
        }
    }

    /// List registered server names.
    pub fn server_names(&self) -> Vec<&str> {
        self.servers.keys().map(|s| s.as_str()).collect()
    }
}

impl Default for McpHost {
    fn default() -> Self {
        Self::new()
    }
}
