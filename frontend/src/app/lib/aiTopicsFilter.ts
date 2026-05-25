/** Match backend aiTopicsFilter — hide "Waiting time" when transcript does not mention waiting. */

const WAITING_TOPIC_RE = /\b(waiting\s*time|wait\s*time|long\s+wait|queue|queued)\b/i;
const WAITING_TA_RE = /காத்திருப்பு|காத்து\s*நேர|வெயிட்|நீண்ட\s*காத்து/i;

function transcriptMentionsWaiting(text: string): boolean {
  if (!text.trim()) return false;
  if (WAITING_TOPIC_RE.test(text)) return true;
  if (WAITING_TA_RE.test(text)) return true;
  return false;
}

function topicImpliesWaiting(topic: string): boolean {
  return /\bwait(ing)?\b/i.test(topic);
}

export function filterAiTopicsForTranscript(
  topics: string[] | undefined,
  comments: string | undefined
): string[] {
  const list = (topics ?? []).map((t) => t.trim()).filter(Boolean);
  if (!list.length) return [];
  const mentionsWait = transcriptMentionsWaiting(comments ?? "");
  return list.filter((topic) => {
    if (topicImpliesWaiting(topic) && !mentionsWait) return false;
    return true;
  });
}
