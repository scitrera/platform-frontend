use scitrera_mcp_host::process::McpServerProcess;
use serde_json::json;

#[tokio::test]
async fn host_filesystem_roundtrip_and_boundaries() {
    let root = std::env::temp_dir().join(format!("scitrera-mcp-roundtrip-{}", std::process::id()));
    std::fs::create_dir_all(root.join("allowed")).unwrap();
    let allowed = root.join("allowed");
    let process = McpServerProcess::spawn("filesystem", env!("CARGO_BIN_EXE_scitrera-mcp-filesystem"),
        &[allowed.to_string_lossy().into_owned()]).await.unwrap();
    let result = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        let tools = process.list_tools().await.unwrap();
        assert_eq!(tools.len(), 4);
        let path = allowed.join("nested/note.txt");
        process.call_tool("write_file", json!({"path": path, "content": "synthetic roundtrip"})).await.unwrap();
        let read = process.call_tool("read_file", json!({"path": path})).await.unwrap();
        assert_eq!(read["content"][0]["text"], "synthetic roundtrip");
        assert!(process.call_tool("write_file", json!({"path": allowed.join("../escape.txt"), "content":"denied"})).await.is_err());
        assert!(!root.join("escape.txt").exists());
        assert!(process.call_tool("search_files", json!({"path":allowed,"pattern":"../*"})).await.is_err());
        let found = process.call_tool("search_files", json!({"path":allowed,"pattern":"**/*.txt"})).await.unwrap();
        assert!(found["content"][0]["text"].as_str().unwrap().contains("note.txt"));
        // Calls from separate tasks must not swap request IDs or results.
        let (a, b) = tokio::join!(process.list_tools(), process.call_tool("read_file", json!({"path":path})));
        assert_eq!(a.unwrap().len(), 4);
        assert_eq!(b.unwrap()["content"][0]["text"], "synthetic roundtrip");
        assert!(process.call_tool("missing_tool", json!({})).await.is_err());
    }).await;
    process.shutdown().await;
    std::fs::remove_dir_all(root).unwrap();
    result.unwrap();
}
