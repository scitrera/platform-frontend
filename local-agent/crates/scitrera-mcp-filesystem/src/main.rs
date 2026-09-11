//! Scitrera Filesystem MCP Server
//!
//! A standalone MCP server binary that provides filesystem access tools.
//! Communicates via stdio using JSON-RPC 2.0 per the MCP specification.
//!
//! Exposed tools:
//! - `read_file(path)` — Read file contents
//! - `write_file(path, content)` — Write content to a file
//! - `list_directory(path)` — List directory entries
//! - `search_files(pattern, path)` — Search for files matching a glob pattern
//!
//! Restrictions:
//! - Allowlist of permitted directories (from command-line args)
//! - This standalone process does not prompt for approval. Its caller owns approval policy.
//! - The experimental daemon does not yet route remote tool calls.

mod allowlist;
mod tools;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{debug, error, info};

/// JSON-RPC 2.0 request (incoming on stdin).
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    #[serde(default)]
    id: Option<u64>,
    method: String,
    #[serde(default)]
    params: Option<serde_json::Value>,
}

/// JSON-RPC 2.0 response (outgoing on stdout).
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

/// JSON-RPC 2.0 error object.
#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Log to stderr so stdout remains clean for JSON-RPC
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "scitrera_mcp_filesystem=info".into()),
        )
        .init();

    // Parse allowed directories from command-line arguments
    let args: Vec<String> = std::env::args().skip(1).collect();
    let allowed_dirs = if args.is_empty() {
        info!("No allowed directories specified — all file access denied");
        Vec::new()
    } else {
        info!(dirs = ?args, "Allowed directories configured");
        args
    };

    let validator = allowlist::PathValidator::new(allowed_dirs);
    let tool_handler = tools::ToolHandler::new(validator);

    info!("Filesystem MCP server starting on stdio");

    let stdin = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut lines = stdin.lines();

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }

        debug!(raw = %line, "Received message");

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(req) => req,
            Err(e) => {
                error!(error = %e, "Failed to parse JSON-RPC request");
                let error_response = JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: 0,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                    }),
                };
                let mut out = serde_json::to_string(&error_response)?;
                out.push('\n');
                stdout.write_all(out.as_bytes()).await?;
                stdout.flush().await?;
                continue;
            }
        };

        // Notifications (no id) don't get responses
        let Some(id) = request.id else {
            debug!(method = %request.method, "Received notification, no response needed");
            continue;
        };

        let response = handle_request(id, &request.method, request.params, &tool_handler).await;

        let mut out = serde_json::to_string(&response)?;
        out.push('\n');
        stdout.write_all(out.as_bytes()).await?;
        stdout.flush().await?;
    }

    info!("Filesystem MCP server shutting down (stdin closed)");
    Ok(())
}

/// Route a JSON-RPC request to the appropriate handler.
async fn handle_request(
    id: u64,
    method: &str,
    params: Option<serde_json::Value>,
    tool_handler: &tools::ToolHandler,
) -> JsonRpcResponse {
    match method {
        "initialize" => handle_initialize(id),
        "tools/list" => handle_tools_list(id),
        "tools/call" => handle_tools_call(id, params, tool_handler).await,
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", method),
            }),
        },
    }
}

/// Handle the MCP `initialize` handshake.
fn handle_initialize(id: u64) -> JsonRpcResponse {
    info!("Handling initialize request");
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": { "listChanged": false }
            },
            "serverInfo": {
                "name": "scitrera-mcp-filesystem",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),
        error: None,
    }
}

/// Handle the MCP `tools/list` request.
fn handle_tools_list(id: u64) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(serde_json::json!({
            "tools": [
                {
                    "name": "read_file",
                    "description": "Read the contents of a file as UTF-8 text",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path to the file to read"
                            }
                        },
                        "required": ["path"]
                    }
                },
                {
                    "name": "write_file",
                    "description": "Write content to a file (creates or overwrites)",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path to the file to write"
                            },
                            "content": {
                                "type": "string",
                                "description": "Content to write to the file"
                            }
                        },
                        "required": ["path", "content"]
                    }
                },
                {
                    "name": "list_directory",
                    "description": "List files and directories at the given path",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path to the directory to list"
                            }
                        },
                        "required": ["path"]
                    }
                },
                {
                    "name": "search_files",
                    "description": "Search for files matching a glob pattern",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "Glob pattern to match (e.g., '**/*.rs')"
                            },
                            "path": {
                                "type": "string",
                                "description": "Root directory to search from"
                            }
                        },
                        "required": ["pattern", "path"]
                    }
                }
            ]
        })),
        error: None,
    }
}

/// Handle the MCP `tools/call` request by dispatching to the tool handler.
async fn handle_tools_call(
    id: u64,
    params: Option<serde_json::Value>,
    tool_handler: &tools::ToolHandler,
) -> JsonRpcResponse {
    let params = match params {
        Some(p) => p,
        None => {
            return JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id,
                result: None,
                error: Some(JsonRpcError {
                    code: -32602,
                    message: "Missing params for tools/call".to_string(),
                }),
            };
        }
    };

    let tool_name = params["name"].as_str().unwrap_or("");
    let arguments = params.get("arguments").cloned().unwrap_or_default();

    match tool_handler.call(tool_name, arguments).await {
        Ok(result) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        },
        Err(e) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(serde_json::json!({
                "content": [{ "type": "text", "text": format!("Error: {}", e) }],
                "isError": true
            })),
            error: None,
        },
    }
}
