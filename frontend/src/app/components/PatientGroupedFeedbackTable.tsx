import { useState } from "react";
import { ChevronDown, ChevronRight, Mic } from "lucide-react";
import type { FeedbackItem } from "../lib/api";
import type { PatientFeedbackGroup } from "../lib/patientFeedbackGroups";
import type { BotConversationAnswer } from "../lib/api";
import {
  botSessionParent,
  childModeShortLabel,
  effectiveFeedbackMode,
  feedbackModeLabel,
  ticketAiSummaryForItem,
  ticketSummariesForDisplay,
} from "../lib/feedbackDisplay";
import { getAiSentimentBucket } from "../lib/sentiment";
import { ticketDepartment, ticketService } from "../lib/ticketFilters";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

type PatientGroupedFeedbackTableProps = {
  groups: PatientFeedbackGroup[];
  variant: "overview" | "tickets";
  onViewItem: (item: FeedbackItem) => void;
  onDeleteItem?: (item: FeedbackItem) => void;
  emptyMessage?: string;
};

function sentimentClass(sentiment: ReturnType<typeof getAiSentimentBucket> | "mixed"): string {
  if (sentiment === "negative") return "bg-red-50 text-red-700";
  if (sentiment === "positive") return "bg-emerald-50 text-emerald-700";
  if (sentiment === "neutral") return "bg-amber-50 text-amber-800";
  if (sentiment === "mixed") return "bg-violet-50 text-violet-800";
  return "bg-gray-100 text-gray-600";
}

export function PatientGroupedFeedbackTable({
  groups,
  variant,
  onViewItem,
  onDeleteItem,
  emptyMessage = "No rows to show.",
}: PatientGroupedFeedbackTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!groups.length) {
    return <p className="p-6 text-gray-600">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="w-8 px-2 py-2.5" />
            {variant === "tickets" ? (
              <>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Patient</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Tickets / services</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden md:table-cell">
                  Sentiment
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden sm:table-cell">
                  Rating
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden lg:table-cell">
                  Submitted
                </th>
              </>
            ) : (
              <>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Patient</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Mode</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden lg:table-cell">
                  Department
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden md:table-cell">
                  Services
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">AI</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden sm:table-cell">
                  Rating
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">AI summary</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 hidden lg:table-cell">
                  Submitted
                </th>
              </>
            )}
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600"> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map((group) => {
            const isOpen = expanded.has(group.groupKey);
            const multi = group.items.length > 1;
            const sentiment = group.dominantSentiment ?? getAiSentimentBucket(group.representative);

            return (
              <GroupRows
                key={group.groupKey}
                group={group}
                multi={multi}
                isOpen={isOpen}
                onToggle={() => toggle(group.groupKey)}
                variant={variant}
                sentiment={sentiment}
                onViewItem={onViewItem}
                onDeleteItem={onDeleteItem}
                groupItems={group.items}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  multi,
  isOpen,
  onToggle,
  variant,
  sentiment,
  onViewItem,
  onDeleteItem,
}: {
  group: PatientFeedbackGroup;
  multi: boolean;
  isOpen: boolean;
  onToggle: () => void;
  variant: "overview" | "tickets";
  sentiment: ReturnType<typeof getAiSentimentBucket>;
  onViewItem: (item: FeedbackItem) => void;
  onDeleteItem?: (item: FeedbackItem) => void;
}) {
  const rep = group.representative;
  const botParentRow = botSessionParent(group.items);
  const botAnswerCount = botParentRow?.botConversationAnswers?.length ?? 0;
  const servicesLine =
    group.services.length > 0
      ? group.services.slice(0, 4).join(", ") + (group.services.length > 4 ? "…" : "")
      : "—";
  const departmentsLine =
    group.departments.length > 0
      ? group.departments.slice(0, 3).join(", ") + (group.departments.length > 3 ? "…" : "")
      : "—";
  const summaryLines = ticketSummariesForDisplay(group.items);
  const parentSummaryLine =
    summaryLines.length > 1
      ? summaryLines.slice(0, 3).join(" · ") + (summaryLines.length > 3 ? "…" : "")
      : summaryLines[0] || rep.aiSummary?.trim() || rep.comments?.trim() || "—";

  const parentRow = (
    <tr className={`${multi ? "bg-blue-50/40" : ""} hover:bg-gray-50/80`}>
      <td className="px-2 py-3 align-top">
        {multi ? (
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded hover:bg-gray-200 text-gray-600"
            aria-expanded={isOpen}
          >
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : null}
      </td>
      {variant === "tickets" ? (
        <>
          <td className="px-4 py-3 font-medium text-sm text-gray-800">
            <div>{group.patientName}</div>
            {group.patientRegNo ? (
              <div className="text-xs text-gray-500 font-normal mt-0.5 font-mono">UHID {group.patientRegNo}</div>
            ) : null}
            {multi ? (
              <div className="text-xs text-[#2A6FDB] font-semibold mt-1">
                {group.ticketCount} ticket{group.ticketCount !== 1 ? "s" : ""} · {group.items.length} record
                {group.items.length !== 1 ? "s" : ""}
              </div>
            ) : null}
          </td>
          <td className="px-4 py-3 text-sm text-gray-600">
            <div className="line-clamp-2">{servicesLine}</div>
            {group.departments[0] ? (
              <div className="text-xs text-gray-500 mt-0.5">{group.departments[0]}</div>
            ) : null}
          </td>
          <td className="px-4 py-3 hidden md:table-cell">
            <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "—"}
            </span>
          </td>
          <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell whitespace-nowrap">
            {group.lowestRating} · {ratingLabel[group.lowestRating] ?? "—"}
            {multi && group.lowestRating !== Math.max(...group.items.map((i) => i.rating)) ? (
              <span className="text-xs text-gray-400 block">lowest</span>
            ) : null}
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-700">
              {group.statusLabel}
            </span>
          </td>
          <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
            {new Date(group.latestCreatedAt).toLocaleDateString()}
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3 font-medium text-sm text-gray-800">
            <div>{group.patientName}</div>
            {multi ? (
              <div className="text-xs text-[#2A6FDB] font-semibold mt-0.5">
                {botAnswerCount > 0
                  ? `${botAnswerCount} bot answer${botAnswerCount !== 1 ? "s" : ""}`
                  : `${group.items.length} submission${group.items.length !== 1 ? "s" : ""}`}
                {group.ticketCount > 0 ? ` · ${group.ticketCount} ticket${group.ticketCount !== 1 ? "s" : ""}` : ""}
                {botAnswerCount > 0 ? " · expand to see each answer" : ""}
              </div>
            ) : null}
          </td>
          <td className="px-4 py-3 text-xs text-gray-600">
            {feedbackModeLabel[effectiveFeedbackMode(rep, group.items)]}
          </td>
          <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell max-w-[140px]">
            <span className="line-clamp-2">{departmentsLine}</span>
          </td>
          <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell max-w-[180px]">
            <span className="line-clamp-2">{servicesLine}</span>
          </td>
          <td className="px-4 py-3">
            <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "pending"}
            </span>
          </td>
          <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell whitespace-nowrap">
            {group.lowestRating} · {ratingLabel[group.lowestRating] ?? "—"}
          </td>
          <td className="px-4 py-3 text-sm text-gray-600">{group.statusLabel}</td>
          <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px]">
            <span className="line-clamp-2">{parentSummaryLine}</span>
          </td>
          <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
            {new Date(group.latestCreatedAt).toLocaleString()}
          </td>
        </>
      )}
      <td className="px-4 py-3 text-right align-top">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onViewItem(rep)}
            className="text-sm font-semibold text-[#2A6FDB] hover:underline"
          >
            {(rep.botConversationAnswers?.length ?? 0) > 0 ? "View & listen" : "View"}
          </button>
          {onDeleteItem ? (
            <button
              type="button"
              onClick={() => onDeleteItem(rep)}
              className="text-sm font-semibold text-[#E5533D] hover:underline"
            >
              Delete
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );

  const botParent = botSessionParent(group.items);
  const botAnswers = [...(botParent?.botConversationAnswers ?? [])].sort(
    (a, b) => a.questionOrder - b.questionOrder
  );

  const childRows =
    multi && isOpen ? (
      <>
        {botAnswers.map((answer) => (
          <BotAnswerRow
            key={`${group.groupKey}-q-${answer.questionOrder}`}
            answer={answer}
            variant={variant}
            onView={() => botParent && onViewItem(botParent)}
          />
        ))}
        {group.items
          .filter((item) => item.isSplitChild)
          .map((item) => (
            <ChildRow
              key={item._id}
              item={item}
              variant={variant}
              onViewItem={onViewItem}
              onDeleteItem={onDeleteItem}
              groupItems={group.items}
            />
          ))}
      </>
    ) : null;

  return (
    <>
      {parentRow}
      {childRows}
    </>
  );
}

function BotAnswerRow({
  answer,
  variant,
  onView,
}: {
  answer: BotConversationAnswer;
  variant: "overview" | "tickets";
  onView: () => void;
}) {
  const sentiment =
    answer.answerSentiment === "positive" ||
    answer.answerSentiment === "neutral" ||
    answer.answerSentiment === "negative"
      ? answer.answerSentiment
      : null;
  const transcript = answer.transcript?.trim() || "—";

  const questionLabel = answer.questionText?.trim() || "Bot question";

  return (
    <tr className="bg-sky-50/50 hover:bg-sky-50/80">
      <td className="px-2 py-2" />
      {variant === "tickets" ? (
        <>
          <td className="px-4 py-2 pl-6 text-sm font-medium text-gray-800 max-w-[220px] line-clamp-2">
            {questionLabel}
          </td>
          <td className="px-4 py-2 text-sm text-gray-700 max-w-[240px] line-clamp-2">{transcript}</td>
          <td className="px-4 py-2 hidden md:table-cell">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "—"}
            </span>
          </td>
          <td colSpan={3} className="px-4 py-2" />
        </>
      ) : (
        <>
          <td className="px-4 py-2 pl-6 text-sm font-medium text-gray-800 max-w-[200px] line-clamp-2">
            {questionLabel}
          </td>
          <td className="px-4 py-2 text-xs text-gray-500">Bot answer</td>
          <td className="px-4 py-2 text-sm text-gray-600 hidden lg:table-cell">—</td>
          <td className="px-4 py-2 text-sm text-gray-600 hidden md:table-cell">—</td>
          <td className="px-4 py-2">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "—"}
            </span>
          </td>
          <td className="px-4 py-2 text-xs hidden sm:table-cell">—</td>
          <td className="px-4 py-2 text-xs">—</td>
          <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] line-clamp-2">{transcript}</td>
          <td className="px-4 py-2" />
        </>
      )}
      <td className="px-4 py-2 text-right">
        <button type="button" onClick={onView} className="text-xs font-semibold text-[#2A6FDB] hover:underline">
          Listen
        </button>
      </td>
    </tr>
  );
}

function ChildRow({
  item,
  variant,
  onViewItem,
  onDeleteItem,
  groupItems,
}: {
  item: FeedbackItem;
  variant: "overview" | "tickets";
  onViewItem: (item: FeedbackItem) => void;
  onDeleteItem?: (item: FeedbackItem) => void;
  groupItems?: FeedbackItem[];
}) {
  const sentiment = getAiSentimentBucket(item);
  const svc = ticketService(item);
  const dept = ticketDepartment(item);

  return (
    <tr className="bg-gray-50/90 hover:bg-gray-100/80">
      <td className="px-2 py-2" />
      {variant === "tickets" ? (
        <>
          <td className="px-4 py-2 pl-8 text-xs font-mono text-gray-700">{item.ticketId ?? item._id}</td>
          <td className="px-4 py-2 text-sm text-gray-700">
            {svc ? <span className="font-medium">Service: {svc}</span> : "—"}
            {dept && dept !== "—" ? <div className="text-xs text-gray-500">{dept}</div> : null}
            {item.isSplitChild ? (
              <div className="text-xs text-amber-700 font-medium">Complaint ticket (split issue)</div>
            ) : null}
            {(item.botConversationAnswers?.length ?? 0) > 0 ? (
              <div className="text-xs text-[#2A6FDB] font-semibold flex items-center gap-1 mt-0.5">
                <Mic size={12} />
                Bot voice Q&amp;A on ticket page
              </div>
            ) : null}
          </td>
          <td className="px-4 py-2 hidden md:table-cell">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "—"}
            </span>
          </td>
          <td className="px-4 py-2 text-xs text-gray-600 hidden sm:table-cell">
            {item.rating} · {ratingLabel[item.rating]}
          </td>
          <td className="px-4 py-2 text-xs">{item.status}</td>
          <td className="px-4 py-2 text-xs text-gray-500 hidden lg:table-cell">
            {new Date(item.createdAt).toLocaleDateString()}
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-2 pl-8 text-xs text-gray-500">↳ ticket</td>
          <td className="px-4 py-2 text-xs text-gray-600">{childModeShortLabel(item, groupItems)}</td>
          <td className="px-4 py-2 text-sm text-gray-600 hidden lg:table-cell">{dept || "—"}</td>
          <td className="px-4 py-2 text-sm text-gray-600 hidden md:table-cell">{svc || "—"}</td>
          <td className="px-4 py-2">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${sentimentClass(sentiment)}`}>
              {sentiment ?? "—"}
            </span>
          </td>
          <td className="px-4 py-2 text-xs hidden sm:table-cell">{item.rating}</td>
          <td className="px-4 py-2 text-xs">{item.status}</td>
          <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] line-clamp-2">
            {ticketAiSummaryForItem(item) || "—"}
          </td>
          <td className="px-4 py-2 text-xs text-gray-500 hidden lg:table-cell">
            {new Date(item.createdAt).toLocaleString()}
          </td>
        </>
      )}
      <td className="px-4 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onViewItem(item)}
            className="text-xs font-semibold text-[#2A6FDB] hover:underline"
          >
            {(item.botConversationAnswers?.length ?? 0) > 0 ? "View & listen" : "View"}
          </button>
          {onDeleteItem ? (
            <button
              type="button"
              onClick={() => onDeleteItem(item)}
              className="text-xs font-semibold text-[#E5533D] hover:underline"
            >
              Delete
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
