export type WaMessage = {
  id: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  text: string;
  messageType: string;
  templateName?: string;
  status: string;
  error?: string;
  uncertain?: boolean;
  createdAt: string;
  reactions?: { emoji: string; direction: string; at: string }[];
  mediaKind?: "image" | "sticker" | "video" | "audio" | "document";
  mediaFilename?: string;
  mediaUrl?: string;
};

export type Conversation = {
  phoneNumber: string;
  chatPath?: string;
  contactName: string;
  profileName?: string;
  matchedUser?: { id?: string; name?: string; email?: string; username?: string; role?: string } | null;
  assignedTo?: { id: string; name: string } | null;
  followUpAt?: string;
  followUpNote?: string;
  lastInboundAt?: string;
  lastInboundId?: string;
  lastMessageAt?: string;
  lastMessageText?: string;
  sentTemplateCount: number;
  unreadCount: number;
  needsReply: boolean;
  resolved: boolean;
  activeUntil?: string;
  canReply: boolean;
};

export type ThreadPage = { messages: WaMessage[]; nextCursor: string | null; hasMore: boolean; loaded: boolean; olderLoaded?: boolean; error?: string };

export function mergeMessages(previous: WaMessage[], incoming: WaMessage[]) {
  const messages = new Map(previous.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}

export function replyWindow(conversation: Conversation, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(conversation.activeUntil || 0).getTime() - now) / 1000));
  if (!seconds) return { open: false, label: "Reply window expired" };
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { open: true, label: `${hours ? `${hours}h ${minutes}m` : seconds >= 60 ? `${minutes}m` : `${seconds}s`} to reply` };
}
