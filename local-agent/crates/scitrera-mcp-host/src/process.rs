//! MCP Server Child Process Management
//!
//! Handles spawning MCP server processes, communicating with them via
//! stdin/stdout using JSON-RPC 2.0, and managing their lifecycle.

use anyhow::{anyhow, Result};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{debug, error, info};

use crate::protocol::{JsonRpcRequest, JsonRpcResponse, ToolInfo, ToolResult};

/// Manages a single MCP server running as a child process.
///
/// Communication uses JSON-RPC 2.0 messages over stdin (requests) and
/// stdout (responses), with one JSON message per line.
pub struct McpServerProcess {
    name: String,
    child: Mutex<Child>,
    stdin: Mutex<tokio::process::ChildStdin>,
    stdout: Mutex<BufReader<tokio::process::ChildStdout>>,
    next_id: AtomicU64,
    request_lock: Mutex<()>,
}

impl McpServerProcess {
    /// Spawn a new MCP server child process.
    pub async fn spawn(name: &str, command: &str, args: &[String]) -> Result<Self> {
        info!(name, command, "Spawning MCP server process");

        let mut child = Command::new(command)
            .args(args)
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn MCP server '{}': {}", name, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stdin for MCP server '{}'", name))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stdout for MCP server '{}'", name))?;

        let process = Self {
            name: name.to_string(),
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            next_id: AtomicU64::new(1),
            request_lock: Mutex::new(()),
        };

        // Send initialize request per MCP spec
        process.initialize().await?;

        Ok(process)
    }

    /// Send the MCP initialize handshake.
    async fn initialize(&self) -> Result<()> {
        let params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": { "listChanged": false }
            },
            "clientInfo": {
                "name": "scitrera-agent",
                "version": env!("CARGO_PKG_VERSION")
            }
        });

        let response = self.send_request("initialize", Some(params)).await?;

        if response.is_error() {
            return Err(anyhow!(
                "MCP server '{}' initialization failed: {:?}",
                self.name,
                response.error
            ));
        }

        debug!(
            name = self.name.as_str(),
            "MCP server initialized, sending initialized notification"
        );

        // Send initialized notification (no id = notification)
        self.send_notification("notifications/initialized", None)
            .await?;

        Ok(())
    }

    /// List tools available on this MCP server.
    pub async fn list_tools(&self) -> Result<Vec<ToolInfo>> {
        let response = self.send_request("tools/list", None).await?;

        if let Some(error) = response.error {
            return Err(anyhow!(
                "tools/list failed on '{}': {}",
                self.name,
                error.message
            ));
        }

        let result = response
            .result
            .ok_or_else(|| anyhow!("Empty result from tools/list on '{}'", self.name))?;

        let tools_value = result
            .get("tools")
            .ok_or_else(|| anyhow!("No 'tools' field in tools/list response"))?;

        let raw_tools: Vec<serde_json::Value> = serde_json::from_value(tools_value.clone())?;

        let tools = raw_tools
            .into_iter()
            .map(|t| ToolInfo {
                server_name: self.name.clone(),
                name: t["name"].as_str().unwrap_or("").to_string(),
                description: t["description"].as_str().unwrap_or("").to_string(),
                input_schema: t["inputSchema"].clone(),
            })
            .collect();

        Ok(tools)
    }

    /// Call a tool on this MCP server.
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });

        let response = self.send_request("tools/call", Some(params)).await?;

        if let Some(error) = response.error {
            return Err(anyhow!(
                "Tool call '{}' failed on '{}': {}",
                tool_name,
                self.name,
                error.message
            ));
        }

        let result = response
            .result
            .ok_or_else(|| anyhow!("Empty result from tool call '{}'", tool_name))?;

        // Parse the MCP tool result
        let tool_result: ToolResult = serde_json::from_value(result.clone())?;

        if tool_result.is_error {
            // Extract error text from content
            let error_text = tool_result
                .content
                .iter()
                .filter_map(|c| match c {
                    crate::protocol::ToolResultContent::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n");
            return Err(anyhow!("Tool '{}' returned error: {}", tool_name, error_text));
        }

        Ok(result)
    }

    /// Send a JSON-RPC request and wait for the response.
    async fn send_request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<JsonRpcResponse> {
        let _request_guard = self.request_lock.lock().await;
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest::new(id, method, params);

        let mut request_line = serde_json::to_string(&request)?;
        request_line.push('\n');

        // Write request to stdin
        {
            let mut stdin = self.stdin.lock().await;
            stdin.write_all(request_line.as_bytes()).await?;
            stdin.flush().await?;
        }

        debug!(
            name = self.name.as_str(),
            method,
            id,
            "Sent JSON-RPC request"
        );

        // Read response from stdout
        let mut response_line = String::new();
        {
            let mut stdout = self.stdout.lock().await;
            stdout.read_line(&mut response_line).await?;
        }

        if response_line.is_empty() {
            return Err(anyhow!(
                "MCP server '{}' closed stdout unexpectedly",
                self.name
            ));
        }

        let response: JsonRpcResponse = serde_json::from_str(&response_line)?;
        if response.id != id {
            return Err(anyhow!("MCP response ID mismatch: expected {}, received {}", id, response.id));
        }

        debug!(
            name = self.name.as_str(),
            id = response.id,
            is_error = response.is_error(),
            "Received JSON-RPC response"
        );

        Ok(response)
    }

    /// Send a JSON-RPC notification (no response expected).
    async fn send_notification(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<()> {
        // Notifications have no id field — use a plain object
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::json!({})),
        });

        let mut line = serde_json::to_string(&notification)?;
        line.push('\n');

        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await?;
        stdin.flush().await?;

        Ok(())
    }

    /// Shut down the MCP server process.
    pub async fn shutdown(self) {
        // Try graceful shutdown first
        let mut child = self.child.into_inner();
        if let Err(e) = child.kill().await {
            error!(
                name = self.name.as_str(),
                error = %e,
                "Failed to kill MCP server process"
            );
        } else {
            info!(name = self.name.as_str(), "MCP server process terminated");
        }
    }
}
