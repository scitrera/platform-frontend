//! Aether gRPC Client (Placeholder)
//!
//! Placeholder implementation for the Aether gateway gRPC client.
//! The real implementation requires the Aether proto files to generate
//! the gRPC service stubs via tonic-build.
//!
//! The client is responsible for:
//! - Connecting to the Aether gateway
//! - Registering the agent's capabilities (MCP servers and their tools)
//! - Receiving tool call requests from cloud agents
//! - Returning tool call results back to the cloud
//! - Maintaining a heartbeat / keepalive

use anyhow::Result;
use scitrera_mcp_host::McpHost;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::config::AgentConfig;
use crate::permission::PermissionGateway;

/// Run the Aether client loop.
///
/// Connects to the Aether gateway, registers capabilities, and processes
/// incoming tool call requests in a loop.
pub async fn run(
    config: &AgentConfig,
    mcp_host: Arc<RwLock<McpHost>>,
    _permissions: Arc<RwLock<PermissionGateway>>,
) -> Result<()> {
    info!(
        gateway = %config.aether.gateway_url,
        workspace = %config.aether.workspace,
        "Connecting to Aether gateway..."
    );

    // TODO: Replace with real gRPC connection using tonic
    // let channel = tonic::transport::Channel::from_shared(config.aether.gateway_url.clone())?
    //     .connect()
    //     .await?;
    // let mut client = aether_proto::agent_service_client::AgentServiceClient::new(channel);

    info!("Connected to Aether gateway (placeholder)");

    // Build capability manifest from MCP host
    let tools = {
        let host = mcp_host.read().await;
        host.list_tools().await
    };

    info!(
        tool_count = tools.len(),
        "Registering capabilities with Aether"
    );

    // TODO: Send capability registration via gRPC
    // let manifest = build_manifest(&config.agent_id, &tools);
    // client.register(manifest).await?;

    // Main event loop — process incoming tool call requests
    // TODO: Replace with gRPC streaming (bidirectional or server-streaming)
    info!("Entering tool call processing loop (placeholder — waiting for Aether proto)");

    loop {
        // TODO: Receive tool call request from gRPC stream
        // let request = stream.next().await;

        // Placeholder: sleep to simulate waiting for requests
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

        // Example of how the real loop will work:
        // if let Some(request) = receive_tool_call().await? {
        //     let status = {
        //         let perms = permissions.read().await;
        //         perms.evaluate(&request.tool_name, &request.server_name, request.task_id.as_deref())
        //     };
        //
        //     match status {
        //         ApprovalStatus::AutoApproved => {
        //             let host = mcp_host.read().await;
        //             let result = host.call_tool(&request.server_name, &request.tool_name, request.args).await;
        //             // Send result back via gRPC
        //         }
        //         ApprovalStatus::PendingApproval => {
        //             // Queue for user approval
        //             // When approved, execute and return result
        //         }
        //         ApprovalStatus::Denied => {
        //             // Return denial to cloud
        //         }
        //     }
        // }

        warn!("Aether client is running in placeholder mode — no real gRPC connection");
    }
}
