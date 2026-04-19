import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { ChatMessage } from '../Components/private/chat/chat';

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: ChatMessage[];
}

type ChatState = {
  conversations: Conversation[];
  activeConversationId: string | null;
};

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const loadFromStorage = (): ChatState => {
  try {
    const raw = localStorage.getItem('chat_state');
    if (!raw) return { conversations: [], activeConversationId: null };
    const parsed = JSON.parse(raw);
    // Re-hydrate Date objects
    parsed.conversations = parsed.conversations.map((c: Conversation) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      messages: c.messages.map((m: ChatMessage) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
    return parsed;
  } catch {
    return { conversations: [], activeConversationId: null };
  }
};

const saveToStorage = (state: ChatState) => {
  try {
    localStorage.setItem('chat_state', JSON.stringify(state));
  } catch { /* quota exceeded or SSR */ }
};

const initialState: ChatState = loadFromStorage();

export const ChatStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({

    // ── Create a new conversation and return its id ──────────────
    createConversation(): string {
      const id = generateId();
      const conversation: Conversation = {
        id,
        title: 'ახალი საუბარი',
        createdAt: new Date(),
        messages: [],
      };
      const next = {
        conversations: [conversation, ...store.conversations()],
        activeConversationId: id,
      };
      patchState(store, next);
      saveToStorage(next);
      return id;
    },

    // ── Set active conversation ──────────────────────────────────
    setActiveConversation(id: string) {
      patchState(store, { activeConversationId: id });
    },

    // ── Get a conversation by id ─────────────────────────────────
    getConversation(id: string): Conversation | undefined {
      return store.conversations().find(c => c.id === id);
    },

    // ── Add a message to a conversation ─────────────────────────
    addMessage(conversationId: string, message: ChatMessage) {
      const conversations = store.conversations().map(c => {
        if (c.id !== conversationId) return c;

        // Auto-title from first user message
        let title = c.title;
        if (c.messages.length === 0 && message.role === 'user' && message.content) {
          title = message.content.slice(0, 40) + (message.content.length > 40 ? '…' : '');
        }

        return { ...c, title, messages: [...c.messages, message] };
      });

      const next = { conversations, activeConversationId: store.activeConversationId() };
      patchState(store, { conversations });
      saveToStorage(next);
    },

    // ── Update (replace) a message by id ────────────────────────
    updateMessage(conversationId: string, messageId: string, patch: Partial<ChatMessage>) {
      const conversations = store.conversations().map(c => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map(m => m.id === messageId ? { ...m, ...patch } : m),
        };
      });
      const next = { conversations, activeConversationId: store.activeConversationId() };
      patchState(store, { conversations });
      saveToStorage(next);
    },

    // ── Remove a message by id ───────────────────────────────────
    removeMessage(conversationId: string, messageId: string) {
      const conversations = store.conversations().map(c => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: c.messages.filter(m => m.id !== messageId) };
      });
      const next = { conversations, activeConversationId: store.activeConversationId() };
      patchState(store, { conversations });
      saveToStorage(next);
    },

    // ── Delete a conversation ────────────────────────────────────
    deleteConversation(id: string) {
      const conversations = store.conversations().filter(c => c.id !== id);
      const activeId = store.activeConversationId() === id
        ? (conversations[0]?.id ?? null)
        : store.activeConversationId();
      const next = { conversations, activeConversationId: activeId };
      patchState(store, next);
      saveToStorage(next);
    },

    // ── Clear all conversations ──────────────────────────────────
    clearAll() {
      const next: ChatState = { conversations: [], activeConversationId: null };
      patchState(store, next);
      saveToStorage(next);
    },
  }))
);
