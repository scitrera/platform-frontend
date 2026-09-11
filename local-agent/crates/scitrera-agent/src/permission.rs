//! Permission Gateway
//!
//! Enforces permission checks on incoming tool calls before dispatching
//! to MCP servers. Read operations are auto-approved by default, while
//! write operations require explicit user approval (either per-call or
//! via standing approval for a task).

use std::collections::HashSet;
use tracing::info;

use crate::config::PermissionConfig;

/// Controls whether tool calls are approved, pending user input, or denied.
#[derive(Debug, Clone, PartialEq)]
pub enum ApprovalStatus {
    /// Automatically approved (e.g., read-only operations).
    AutoApproved,
    /// Requires user approval before execution.
    PendingApproval,
    /// Denied by policy.
    Denied,
}

/// Category of a tool call, used to determine the approval flow.
#[derive(Debug, Clone, PartialEq)]
pub enum ToolCategory {
    /// Read-only operations (auto-approved by default).
    Read,
    /// Write operations (require approval unless standing approval exists).
    Write,
    /// Destructive operations (always require per-call approval).
    Destructive,
}

/// Evaluates permission policies and manages standing approvals for tool calls.
pub struct PermissionGateway {
    auto_approve_reads: bool,
    prompt_all_writes: bool,
    /// Standing approvals granted by the user: (task_id, server_name) pairs.
    standing_approvals: HashSet<(String, String)>,
}

impl PermissionGateway {
    /// Create a new permission gateway from configuration.
    pub fn new(config: &PermissionConfig) -> Self {
        Self {
            auto_approve_reads: config.auto_approve_reads,
            prompt_all_writes: config.prompt_all_writes,
            standing_approvals: HashSet::new(),
        }
    }

    /// Evaluate whether a tool call should be approved, pended, or denied.
    ///
    /// The decision depends on:
    /// - Tool category (read/write/destructive)
    /// - Configuration policy
    /// - Standing approvals for this task+server combination
    pub fn evaluate(
        &self,
        tool_name: &str,
        server_name: &str,
        task_id: Option<&str>,
    ) -> ApprovalStatus {
        let category = Self::categorize(tool_name);

        match category {
            ToolCategory::Read => {
                if self.auto_approve_reads {
                    info!(tool = tool_name, "Auto-approving read operation");
                    ApprovalStatus::AutoApproved
                } else {
                    ApprovalStatus::PendingApproval
                }
            }
            ToolCategory::Write => {
                if self.prompt_all_writes {
                    return ApprovalStatus::PendingApproval;
                }

                // Check for standing approval on this task+server
                if let Some(task_id) = task_id {
                    let key = (task_id.to_string(), server_name.to_string());
                    if self.standing_approvals.contains(&key) {
                        info!(
                            tool = tool_name,
                            task_id,
                            "Approved via standing approval"
                        );
                        return ApprovalStatus::AutoApproved;
                    }
                }

                ApprovalStatus::PendingApproval
            }
            ToolCategory::Destructive => {
                // Destructive operations always require per-call approval
                ApprovalStatus::PendingApproval
            }
        }
    }

    /// Grant a standing approval for a task+server combination.
    ///
    /// Future write operations for this task on this server will be
    /// auto-approved until the approval is revoked.
    pub fn grant_standing_approval(&mut self, task_id: &str, server_name: &str) {
        info!(task_id, server_name, "Granting standing approval");
        self.standing_approvals
            .insert((task_id.to_string(), server_name.to_string()));
    }

    /// Revoke a standing approval.
    pub fn revoke_standing_approval(&mut self, task_id: &str, server_name: &str) {
        info!(task_id, server_name, "Revoking standing approval");
        self.standing_approvals
            .remove(&(task_id.to_string(), server_name.to_string()));
    }

    /// Categorize a tool call based on its name prefix.
    fn categorize(tool_name: &str) -> ToolCategory {
        // Read operations
        if tool_name.starts_with("read_")
            || tool_name.starts_with("list_")
            || tool_name.starts_with("get_")
            || tool_name.starts_with("search_")
        {
            return ToolCategory::Read;
        }

        // Destructive operations
        if tool_name.starts_with("delete_")
            || tool_name.starts_with("remove_")
            || tool_name.starts_with("drop_")
        {
            return ToolCategory::Destructive;
        }

        // Default: write
        ToolCategory::Write
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> PermissionConfig {
        PermissionConfig {
            auto_approve_reads: true,
            prompt_all_writes: false,
        }
    }

    #[test]
    fn test_read_auto_approved() {
        let gw = PermissionGateway::new(&default_config());
        assert_eq!(
            gw.evaluate("read_file", "filesystem", None),
            ApprovalStatus::AutoApproved
        );
        assert_eq!(
            gw.evaluate("list_directory", "filesystem", None),
            ApprovalStatus::AutoApproved
        );
        assert_eq!(
            gw.evaluate("search_files", "filesystem", None),
            ApprovalStatus::AutoApproved
        );
    }

    #[test]
    fn test_write_requires_approval() {
        let gw = PermissionGateway::new(&default_config());
        assert_eq!(
            gw.evaluate("write_file", "filesystem", None),
            ApprovalStatus::PendingApproval
        );
    }

    #[test]
    fn test_standing_approval() {
        let mut gw = PermissionGateway::new(&default_config());
        gw.grant_standing_approval("task-1", "filesystem");
        assert_eq!(
            gw.evaluate("write_file", "filesystem", Some("task-1")),
            ApprovalStatus::AutoApproved
        );
        // Different task still requires approval
        assert_eq!(
            gw.evaluate("write_file", "filesystem", Some("task-2")),
            ApprovalStatus::PendingApproval
        );
    }

    #[test]
    fn test_destructive_always_pending() {
        let mut gw = PermissionGateway::new(&default_config());
        gw.grant_standing_approval("task-1", "filesystem");
        assert_eq!(
            gw.evaluate("delete_file", "filesystem", Some("task-1")),
            ApprovalStatus::PendingApproval
        );
    }

    #[test]
    fn test_categorization() {
        assert_eq!(PermissionGateway::categorize("read_file"), ToolCategory::Read);
        assert_eq!(PermissionGateway::categorize("get_info"), ToolCategory::Read);
        assert_eq!(PermissionGateway::categorize("write_file"), ToolCategory::Write);
        assert_eq!(PermissionGateway::categorize("update_cell"), ToolCategory::Write);
        assert_eq!(PermissionGateway::categorize("delete_file"), ToolCategory::Destructive);
    }
}
