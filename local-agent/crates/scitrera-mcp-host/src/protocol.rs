//! MCP JSON-RPC Protocol Types
//!
//! Defines the message types for the Model Context Protocol (MCP) which
//! uses JSON-RPC 2.0 over stdio for communication between the host and
//! MCP server processes.

use serde::{Deserialize, Serialize};

/// A JSON-RPC 2.0 request message sent from host to MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// A JSON-RPC 2.0 response message received from an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// A JSON-RPC 2.0 error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Information about a tool exposed by an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    /// Name of the MCP server that provides this tool.
    pub server_name: String,
    /// Name of the tool.
    pub name: String,
    /// Human-readable description of what the tool does.
    pub description: String,
    /// JSON Schema describing the tool's input parameters.
    pub input_schema: serde_json::Value,
}

/// Result of a tool call from an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    #[serde(default)]
    pub content: Vec<ToolResultContent>,
    #[serde(default, rename = "isError")]
    pub is_error: bool,
}

/// A content block within a tool result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ToolResultContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, #[serde(rename = "mimeType")] mime_type: String },
}

impl JsonRpcRequest {
    /// Create a new JSON-RPC request.
    pub fn new(id: u64, method: &str, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        }
    }
}

impl JsonRpcResponse {
    /// Check if this response indicates an error.
    pub fn is_error(&self) -> bool {
        self.error.is_some()
    }
}

// Standard MCP JSON-RPC error codes
pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;
pub const INTERNAL_ERROR: i64 = -32603;
