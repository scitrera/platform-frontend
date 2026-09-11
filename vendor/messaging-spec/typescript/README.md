# @scitrera/messaging-spec

TypeScript reference implementation of the Scitrera Ecosystem Messaging Spec,
including the v1.0 chat schema, provider-qualified tool catalog, workspace
execution binding, and session attach/recovery protocol.

```ts
import {
    type ChatMessage,
    type StreamEvent,
    applyEvent,
    makeChatMessage,
    MESSAGING_SCHEMA_VERSION,
} from "@scitrera/messaging-spec";

const m: ChatMessage = makeChatMessage({
    id: "msg_1",
    role: "assistant",
    content: [
        {type: "text", text: "hello"},
        {type: "tool_call", id: "c1", name: "now", args: {}, status: "completed"},
        {type: "tool_result", call_id: "c1", output_text: "3pm", is_error: false},
    ],
});
```

See the [message spec](../docs/UNIVERSAL_MESSAGE_SPEC.md) and
[tool catalog](../docs/TOOL_CATALOG_PROTOCOL.md),
[workspace execution](../docs/WORKSPACE_EXECUTION_PROTOCOL.md), and
[session protocol](../docs/SESSION_PROTOCOL.md) for the normative contracts.

## Install

```bash
npm install @scitrera/messaging-spec
```

Then `import {ChatMessage} from "@scitrera/messaging-spec";`.
