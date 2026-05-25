import type { LucideIcon } from "lucide-react";
import { Bot, Keyboard, Mic } from "lucide-react";

export type FeedbackModeChoice = {
  id: "bot" | "voice" | "type";
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path: string;
};

/** Patient feedback entry — keep titles short; subtitles align card height. */
export const feedbackModeChoices: FeedbackModeChoice[] = [
  {
    id: "bot",
    icon: Bot,
    title: "AI Voice Guide",
    subtitle: "Tamil Q&A",
    path: "/feedback/bot",
  },
  {
    id: "voice",
    icon: Mic,
    title: "Voice feedback",
    subtitle: "Speak freely",
    path: "/feedback/give?mode=voice",
  },
  {
    id: "type",
    icon: Keyboard,
    title: "Rate & share",
    subtitle: "Stars + comments",
    path: "/feedback/give",
  },
];
