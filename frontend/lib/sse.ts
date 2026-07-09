import type { ResponseEvent } from "@/lib/types";

export interface RawSseEvent {
  event: string;
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = "";
  private eventName = "message";
  private dataLines: string[] = [];
  private id: string | undefined;

  constructor(private readonly onEvent: (event: RawSseEvent) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const lineFeed = this.buffer.indexOf("\n");
      const carriageReturn = this.buffer.indexOf("\r");
      const newline = lineFeed === -1 ? carriageReturn : carriageReturn === -1 ? lineFeed : Math.min(lineFeed, carriageReturn);
      if (newline === -1) break;
      if (this.buffer[newline] === "\r" && newline === this.buffer.length - 1) break;
      const delimiterLength = this.buffer[newline] === "\r" && this.buffer[newline + 1] === "\n" ? 2 : 1;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + delimiterLength);
      this.processLine(line);
    }
  }

  finish(): void {
    if (this.buffer.endsWith("\r")) this.buffer = this.buffer.slice(0, -1);
    if (this.buffer) this.processLine(this.buffer);
    this.buffer = "";
    this.dispatch();
  }

  private processLine(line: string): void {
    if (line === "") {
      this.dispatch();
      return;
    }
    if (line.startsWith(":")) return;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") this.eventName = value || "message";
    if (field === "data") this.dataLines.push(value);
    if (field === "id") this.id = value;
  }

  private dispatch(): void {
    if (this.dataLines.length === 0) {
      this.eventName = "message";
      this.id = undefined;
      return;
    }
    this.onEvent({ event: this.eventName, data: this.dataLines.join("\n"), id: this.id });
    this.eventName = "message";
    this.dataLines = [];
    this.id = undefined;
  }
}

export function parseResponseEnvelope(event: RawSseEvent): ResponseEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(event.data);
  } catch {
    throw new Error(`Invalid JSON in SSE ${event.event} event`);
  }
  if (!payload || typeof payload !== "object") throw new Error("Invalid SSE response envelope");
  const envelope = payload as Partial<ResponseEvent>;
  if (typeof envelope.seq !== "number" || typeof envelope.response_id !== "string") {
    throw new Error("SSE response envelope is missing seq or response_id");
  }
  return {
    seq: envelope.seq,
    type: typeof envelope.type === "string" ? envelope.type : event.event,
    response_id: envelope.response_id,
    data: envelope.data,
  };
}
