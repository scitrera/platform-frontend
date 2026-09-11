//! Agent Configuration
//!
//! Loads the agent configuration from `~/.scitrera/agent.toml`. The config
//! file specifies the Aether gateway connection, MCP server definitions,
//! and permission policies.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

/// Top-level agent configuration loaded from `~/.scitrera/agent.toml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Unique identifier for this agent instance (defaults to hostname).
    #[serde(default = "default_agent_id")]
    pub agent_id: String,

    /// Aether gateway connection settings.
    #[serde(default)]
    pub aether: AetherConfig,

    /// MCP server definitions to register and manage.
    #[serde(default)]
    pub servers: Vec<ServerConfig>,

    /// Permission gateway settings.
    #[serde(default)]
    pub permissions: PermissionConfig,
}

/// Aether gateway connection configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AetherConfig {
    /// gRPC endpoint URL for the Aether gateway.
    #[serde(default = "default_gateway_url")]
    pub gateway_url: String,

    /// Workspace identifier to register under.
    #[serde(default = "default_workspace")]
    pub workspace: String,

    /// Authentication token (can also be set via SCITRERA_AUTH_TOKEN env var).
    pub auth_token: Option<String>,

    /// Whether to use TLS for the gRPC connection.
    #[serde(default = "default_true")]
    pub tls: bool,
}

/// Configuration for an individual MCP server process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Name used to identify this server in tool routing.
    pub name: String,

    /// Whether this server should be started.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Command to execute to start the MCP server process.
    pub command: String,

    /// Arguments to pass to the command.
    #[serde(default)]
    pub args: Vec<String>,
}

/// Permission gateway configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionConfig {
    /// Whether read-only operations are auto-approved without user prompt.
    #[serde(default = "default_true")]
    pub auto_approve_reads: bool,

    /// Whether to prompt for every write operation (true) or allow standing
    /// approvals per task (false).
    #[serde(default)]
    pub prompt_all_writes: bool,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            agent_id: default_agent_id(),
            aether: AetherConfig::default(),
            servers: Vec::new(),
            permissions: PermissionConfig::default(),
        }
    }
}

impl Default for AetherConfig {
    fn default() -> Self {
        Self {
            gateway_url: default_gateway_url(),
            workspace: default_workspace(),
            auth_token: None,
            tls: true,
        }
    }
}

impl Default for PermissionConfig {
    fn default() -> Self {
        Self {
            auto_approve_reads: true,
            prompt_all_writes: false,
        }
    }
}

/// Load agent configuration from `~/.scitrera/agent.toml`.
///
/// If the file does not exist, returns a default configuration.
/// The auth_token can be overridden by the `SCITRERA_AUTH_TOKEN` environment
/// variable.
pub fn load_config() -> Result<AgentConfig> {
    let config_path = config_path();

    let mut config = if config_path.exists() {
        info!(path = %config_path.display(), "Loading configuration");
        let contents = std::fs::read_to_string(&config_path)
            .with_context(|| format!("Failed to read config file: {}", config_path.display()))?;
        toml::from_str::<AgentConfig>(&contents)
            .with_context(|| format!("Failed to parse config file: {}", config_path.display()))?
    } else {
        info!(
            path = %config_path.display(),
            "Config file not found, using defaults"
        );
        AgentConfig::default()
    };

    // Allow env var override for auth token
    if let Ok(token) = std::env::var("SCITRERA_AUTH_TOKEN") {
        config.aether.auth_token = Some(token);
    }

    Ok(config)
}

/// Returns the path to the agent configuration file.
fn config_path() -> PathBuf {
    dirs_next().join("agent.toml")
}

/// Returns the Scitrera configuration directory (`~/.scitrera/`).
fn dirs_next() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".scitrera")
}

fn default_agent_id() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "local-agent".to_string())
}

fn default_gateway_url() -> String {
    "https://localhost:8443".to_string()
}

fn default_workspace() -> String {
    "default".to_string()
}

fn default_true() -> bool {
    true
}
