//! Scitrera Local Agent Daemon
//!
//! The main daemon binary that runs on the user's desktop. It:
//! 1. Loads configuration from `~/.scitrera/agent.toml`
//! 2. Connects to the Aether gateway via gRPC
//! 3. Starts the MCP host (manages child MCP server processes)
//! 4. Listens for tool call requests from cloud agents
//! 5. Routes tool calls through the permission gateway
//! 6. Executes via the appropriate MCP server
//! 7. Returns results to the cloud

mod aether_client;
mod config;
mod permission;

use anyhow::Result;
use scitrera_mcp_host::McpHost;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "scitrera_agent=info,scitrera_mcp_host=info".into()),
        )
        .init();

    info!("Scitrera Local Agent starting...");

    // Load configuration from ~/.scitrera/agent.toml
    let agent_config = config::load_config()?;
    info!(
        agent_id = %agent_config.agent_id,
        gateway = %agent_config.aether.gateway_url,
        "Configuration loaded"
    );

    // Initialize MCP host and register configured servers
    let mcp_host = Arc::new(RwLock::new(McpHost::new()));
    register_mcp_servers(&agent_config, &mcp_host).await;

    // List discovered tools
    {
        let host = mcp_host.read().await;
        let tools = host.list_tools().await;
        info!(
            tool_count = tools.len(),
            servers = ?host.server_names(),
            "MCP servers initialized"
        );
    }

    // Initialize permission gateway
    let permissions = Arc::new(RwLock::new(permission::PermissionGateway::new(
        &agent_config.permissions,
    )));

    // Connect to Aether gateway and process tool call requests
    let aether_handle = {
        let config = agent_config.clone();
        let host = Arc::clone(&mcp_host);
        let perms = Arc::clone(&permissions);
        tokio::spawn(async move {
            if let Err(e) = aether_client::run(&config, host, perms).await {
                error!(error = %e, "Aether client error");
            }
        })
    };

    info!("Scitrera Local Agent running. Press Ctrl+C to stop.");

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("Shutdown signal received, stopping...");

    aether_handle.abort();

    // Gracefully shut down MCP servers
    {
        let mut host = mcp_host.write().await;
        host.shutdown().await;
    }

    info!("Scitrera Local Agent stopped.");
    Ok(())
}

/// Register MCP servers based on the agent configuration.
async fn register_mcp_servers(
    config: &config::AgentConfig,
    host: &Arc<RwLock<McpHost>>,
) {
    for server_config in &config.servers {
        if !server_config.enabled {
            info!(name = %server_config.name, "Skipping disabled MCP server");
            continue;
        }

        let mut host = host.write().await;
        if let Err(e) = host
            .register_server(
                &server_config.name,
                &server_config.command,
                &server_config.args,
            )
            .await
        {
            error!(
                name = %server_config.name,
                error = %e,
                "Failed to register MCP server"
            );
        }
    }
}
