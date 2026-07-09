import { describe, expect, it, vi } from "vitest";
import { parseResponseEnvelope, SseParser } from "@/lib/sse";

describe("SseParser", () => {
  it("parses named events across arbitrary chunk boundaries", () => {
    const onEvent = vi.fn();
    const parser = new SseParser(onEvent);

    parser.push(": keepalive\r");
    parser.push("\nevent: token\r\nid: 42\r\ndata: {\"seq\":1,\"type\":\"token\",");
    parser.push("\"response_id\":\"rsp_1\",\"data\":\"Atlas\"}\r\n\r\n");

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      event: "token",
      id: "42",
      data: "{\"seq\":1,\"type\":\"token\",\"response_id\":\"rsp_1\",\"data\":\"Atlas\"}",
    });
  });

  it("joins multiline data and flushes an unterminated final event", () => {
    const events: Array<{ event: string; data: string }> = [];
    const parser = new SseParser((event) => events.push(event));

    parser.push("event: status\ndata: first\ndata: second");
    parser.finish();

    expect(events).toEqual([{ event: "status", data: "first\nsecond", id: undefined }]);
  });
});

describe("parseResponseEnvelope", () => {
  it("uses the SSE event name when the envelope omits type", () => {
    expect(parseResponseEnvelope({ event: "usage", data: JSON.stringify({ seq: 7, response_id: "rsp_7", data: { total_tokens: 42 } }) })).toEqual({
      seq: 7,
      type: "usage",
      response_id: "rsp_7",
      data: { total_tokens: 42 },
    });
  });

  it("rejects malformed event data", () => {
    expect(() => parseResponseEnvelope({ event: "token", data: "not-json" })).toThrow("Invalid JSON");
    expect(() => parseResponseEnvelope({ event: "token", data: JSON.stringify({ type: "token" }) })).toThrow("missing seq or response_id");
  });
});
