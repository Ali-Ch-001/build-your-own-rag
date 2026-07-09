import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat-composer";

function ControlledComposer({ onSubmit = vi.fn(), onCancel = vi.fn(), streaming = false }: { onSubmit?: () => void; onCancel?: () => void; streaming?: boolean }) {
  const [value, setValue] = useState("");
  return <ChatComposer value={value} onChange={setValue} onSubmit={onSubmit} onCancel={onCancel} streaming={streaming} />;
}

describe("ChatComposer", () => {
  it("submits a non-empty query with Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledComposer onSubmit={onSubmit} />);

    const input = screen.getByLabelText("Ask a grounded question");
    await user.type(input, "What changed in the risk policy?");
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps Shift+Enter available for a new line", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ControlledComposer onSubmit={onSubmit} />);

    const input = screen.getByLabelText("Ask a grounded question");
    await user.type(input, "First line");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes cancellation while a response is streaming", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ControlledComposer streaming onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel response" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Send question" })).not.toBeInTheDocument();
  });
});
