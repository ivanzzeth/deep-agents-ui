import type { ContentBlock } from "@langchain/core/messages";
import type { Message as SdkMessage } from "@langchain/langgraph-sdk";

/**
 * UI-facing content block.
 *
 * SDK's `MessageContentComplex` only includes `text` and `image_url` variants
 * (see `@langchain/langgraph-sdk` types.messages). Agent Chat UI / our composer
 * emits `ContentBlock.Multimodal.Data` shape (`{type, mimeType, data, ...}`)
 * which does not fit the SDK union exactly. The backend
 * `NormalizeMultimodalContentBlocks` middleware bridges the JS↔Python schemas
 * at the model boundary, so we transport the richer shape verbatim through
 * the SDK and only narrow it here in the UI.
 */
export type RichContentBlock =
  | { type: "text"; text: string }
  | ContentBlock.Multimodal.Data;

export type RichMessageContent = string | RichContentBlock[];

/**
 * UI-facing message — same as the SDK Message but with content widened to
 * carry our multimodal blocks.
 *
 * `Omit` on a union collapses to the intersection of all members and loses
 * variant-specific fields (e.g. `tool_calls` on AIMessage). The distributive
 * conditional below applies the Omit to each member of the SDK union so that
 * narrowing on `message.type` still surfaces those fields.
 */
type WithRichContent<M> = M extends unknown
  ? Omit<M, "content"> & { content: RichMessageContent }
  : never;

export type RichMessage = WithRichContent<SdkMessage>;

/**
 * Narrowing helper. After excluding the text branch, what remains is
 * `ContentBlock.Multimodal.Data`.
 */
export function isMultimodalBlock(
  block: RichContentBlock
): block is ContentBlock.Multimodal.Data {
  return block.type !== "text";
}

/** Input to `useChat.sendMessage`. */
export interface SendInput {
  text: string;
  attachments?: ReadonlyArray<ContentBlock.Multimodal.Data>;
}

/**
 * SDK boundary: outgoing.
 *
 * SDK's `Message.content` type is narrower than our `RichMessage.content`
 * (it doesn't list `Multimodal.Data` as a variant), but the SDK serializes
 * content as opaque JSON at runtime. This single named cast is the only
 * place that crosses that gap.
 */
export function toSdkMessages(messages: readonly RichMessage[]): SdkMessage[] {
  return messages as unknown as SdkMessage[];
}

/**
 * SDK boundary: incoming.
 *
 * `stream.messages` is `SdkMessage[]`. We widen it to `RichMessage[]` so
 * downstream components can narrow via discriminated union.
 */
export function fromSdkMessages(
  messages: readonly SdkMessage[]
): RichMessage[] {
  return messages as unknown as RichMessage[];
}
