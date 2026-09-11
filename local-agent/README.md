# Local agent / MCP — experimental / incomplete

**The daemon does not connect to the platform.** Its Aether adapter logs placeholder
mode; real gRPC connection, capability registration and the remote tool stream are
unimplemented. The permission gateway is unit-tested policy code and is not wired
to an end-to-end remote invocation/approval UI. Do not interpret startup logs or
MCP test success as proof of a cloud connection.

| Crate | Implemented scope |
| --- | --- |
| `scitrera-agent` | Config loading, MCP server startup, permission policy scaffolding, placeholder Aether adapter |
| `scitrera-mcp-host` | Spawn/init, tool enumeration and calls over line-delimited stdio JSON-RPC; serialized requests, response ID/error checks, child cleanup |
| `scitrera-mcp-filesystem` | read_file, write_file, list_directory, search_files with configured directory policy |

Use Rust **1.92.0** (`rust-toolchain.toml`), from this directory:

```sh
cargo test --workspace --locked
cargo build --workspace --locked
```

The integration test launches the real filesystem server through the MCP host,
creates/reads a temporary note, rejects traversal and invalid tool calls, checks
concurrent request results, and shuts down the child. Permission-policy tests cover
read auto-approval, pending writes, standing approval and destructive operations.

For standalone filesystem testing, pass one or more **existing directories**:

```sh
mkdir -p /tmp/mcp-example
./target/debug/scitrera-mcp-filesystem /tmp/mcp-example
```

Empty or missing roots deny all paths. Absolute paths are required. Parent traversal,
existing symlink escapes and new files beneath symlink escapes are rejected; search
patterns cannot escape the supplied root. These checks are not a race-free OS
sandbox against concurrent malicious filesystem mutation. Run only with directories
you intend to expose and trusted local processes. The standalone server performs
writes without an approval dialog: its caller owns consent/policy. The daemon's
unwired permission gateway does not protect arbitrary standalone invocations.

The supported protocol subset uses numeric IDs, newline-delimited JSON-RPC and
MCP protocol `2024-11-05`. Arbitrary server notifications, timeouts/cancellation,
version negotiation and every newer MCP feature are not implemented. This is not
a general interoperability certification. The host validates `isError` and does
not treat malformed tool results as successful calls.

Daemon config is read from `~/.scitrera/agent.toml`; inspect `config.rs` for fields.
No token or operational config is supplied. The gateway default is loopback and
inert while the transport is a placeholder. Do not add credentials to source.
MIT licensing is preserved from the original Cargo workspace; see LICENSE.
