import type { Metadata } from "next";
import { ChatWorkspace } from "@/components/chat-workspace";

export const metadata: Metadata = { title: "Grounded Chat" };
export default function ChatPage() { return <ChatWorkspace />; }
