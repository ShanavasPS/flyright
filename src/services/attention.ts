/** null means still loading, not nothing waiting. */
export type AttentionCounts = { people: number | null; support: number | null; update: number | null };
export type AttentionSource = keyof AttentionCounts;

export const ATTENTION_CHANNEL = 'flyright-attention';
export const attentionId = (source: AttentionSource) => `flyright-attention-${source}`;

/** The icon is an attention indicator. Source counts belong inside the app;
 * a release push cannot know the unread counts on each receiving device. */
export function attentionBadge(counts: AttentionCounts): 0 | 1 | null {
  if (Object.values(counts).some((count) => count !== null && count > 0)) return 1;
  return Object.values(counts).some((count) => count === null) ? null : 0;
}

export const attentionCopy = {
  people: { title: 'New activity in People', body: 'Open People to see your new followers and requests.', url: '/people' },
  support: { title: 'A reply from FlyRight', body: 'Open your messages to read your reply.', url: '/messages' },
  update: { title: 'FlyRight update available', body: 'Get the latest version from your app store.', url: '/whats-new' },
} satisfies Record<AttentionSource, { title: string; body: string; url: string }>;
