//! Filesystem Tool Implementations
//!
//! Implements the actual filesystem operations exposed as MCP tools:
//! read_file, write_file, list_directory, and search_files.

use anyhow::{anyhow, Result};
use tracing::info;

use crate::allowlist::PathValidator;

/// Handles tool call dispatch and execution for filesystem operations.
pub struct ToolHandler {
    validator: PathValidator,
}

impl ToolHandler {
    pub fn new(validator: PathValidator) -> Self {
        Self { validator }
    }

    /// Dispatch a tool call by name to the appropriate implementation.
    pub async fn call(
        &self,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value> {
        match tool_name {
            "read_file" => self.read_file(args).await,
            "write_file" => self.write_file(args).await,
            "list_directory" => self.list_directory(args).await,
            "search_files" => self.search_files(args).await,
            _ => Err(anyhow!("Unknown tool: {}", tool_name)),
        }
    }

    /// Read the contents of a file as UTF-8 text.
    async fn read_file(&self, args: serde_json::Value) -> Result<serde_json::Value> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: path"))?;

        self.validator
            .validate(path)
            .map_err(|e| anyhow!("{}", e))?;

        info!(path, "Reading file");

        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| anyhow!("Failed to read '{}': {}", path, e))?;

        Ok(serde_json::json!({
            "content": [{ "type": "text", "text": content }]
        }))
    }

    /// Write content to a file, creating parent directories if needed.
    async fn write_file(&self, args: serde_json::Value) -> Result<serde_json::Value> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: path"))?;
        let content = args["content"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: content"))?;

        self.validator
            .validate(path)
            .map_err(|e| anyhow!("{}", e))?;

        info!(path, bytes = content.len(), "Writing file");

        // Create parent directories if they don't exist
        if let Some(parent) = std::path::Path::new(path).parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| anyhow!("Failed to create directories for '{}': {}", path, e))?;
        }

        tokio::fs::write(path, content)
            .await
            .map_err(|e| anyhow!("Failed to write '{}': {}", path, e))?;

        Ok(serde_json::json!({
            "content": [{ "type": "text", "text": format!("Successfully wrote {} bytes to {}", content.len(), path) }]
        }))
    }

    /// List entries in a directory.
    async fn list_directory(&self, args: serde_json::Value) -> Result<serde_json::Value> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: path"))?;

        self.validator
            .validate(path)
            .map_err(|e| anyhow!("{}", e))?;

        info!(path, "Listing directory");

        let mut entries = Vec::new();
        let mut dir = tokio::fs::read_dir(path)
            .await
            .map_err(|e| anyhow!("Failed to read directory '{}': {}", path, e))?;

        while let Some(entry) = dir.next_entry().await? {
            let file_type = entry.file_type().await?;
            let entry_type = if file_type.is_dir() {
                "directory"
            } else if file_type.is_symlink() {
                "symlink"
            } else {
                "file"
            };

            entries.push(serde_json::json!({
                "name": entry.file_name().to_string_lossy(),
                "type": entry_type,
            }));
        }

        // Sort entries by name for deterministic output
        entries.sort_by(|a, b| {
            a["name"]
                .as_str()
                .unwrap_or("")
                .cmp(b["name"].as_str().unwrap_or(""))
        });

        let listing = entries
            .iter()
            .map(|e| {
                let prefix = match e["type"].as_str().unwrap_or("") {
                    "directory" => "[dir]  ",
                    "symlink" => "[link] ",
                    _ => "[file] ",
                };
                format!("{}{}", prefix, e["name"].as_str().unwrap_or(""))
            })
            .collect::<Vec<_>>()
            .join("\n");

        Ok(serde_json::json!({
            "content": [{ "type": "text", "text": listing }]
        }))
    }

    /// Search for files matching a glob pattern under a root directory.
    async fn search_files(&self, args: serde_json::Value) -> Result<serde_json::Value> {
        let pattern = args["pattern"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: pattern"))?;
        let path = args["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter: path"))?;

        self.validator
            .validate(path)
            .map_err(|e| anyhow!("{}", e))?;

        info!(pattern, path, "Searching files");

        if std::path::Path::new(pattern).is_absolute()
            || pattern.split(['/', '\\']).any(|p| p == "..") {
            return Err(anyhow!("Search pattern must stay within its root"));
        }
        let full_pattern = format!("{}/{}", glob::Pattern::escape(path.trim_end_matches('/')), pattern);

        // glob::glob is blocking, run in spawn_blocking to avoid blocking the
        // async runtime
        let matches = tokio::task::spawn_blocking(move || {
            let mut results = Vec::new();
            match glob::glob(&full_pattern) {
                Ok(paths) => {
                    for entry in paths.flatten() {
                        results.push(entry.display().to_string());
                    }
                }
                Err(e) => {
                    return Err(anyhow!("Invalid glob pattern '{}': {}", full_pattern, e));
                }
            }
            Ok(results)
        })
        .await??;

        let matches: Vec<_> = matches.into_iter()
            .filter(|p| self.validator.is_allowed(p)).collect();
        let result_text = if matches.is_empty() {
            "No files found matching the pattern".to_string()
        } else {
            format!(
                "Found {} file(s):\n{}",
                matches.len(),
                matches.join("\n")
            )
        };

        Ok(serde_json::json!({
            "content": [{ "type": "text", "text": result_text }]
        }))
    }
}
