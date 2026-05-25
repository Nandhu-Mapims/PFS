import { useNavigate } from "react-router";
import { feedbackModeChoices } from "../lib/feedbackModeChoices";

type FeedbackModeCardsProps = {
  primaryColor: string;
};

export function FeedbackModeCards({ primaryColor }: FeedbackModeCardsProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 items-stretch">
      {feedbackModeChoices.map((choice) => {
        const Icon = choice.icon;
        return (
          <button
            key={choice.id}
            type="button"
            onClick={() => navigate(choice.path)}
            className="flex h-full min-h-[11.5rem] flex-col items-center justify-center rounded-2xl border-2 border-gray-200 bg-[#F5F7FA] px-4 py-6 md:py-8 transition-all hover:scale-[1.02] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2A6FDB]"
          >
            <div
              className="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white shadow-inner"
              style={{ backgroundColor: primaryColor }}
            >
              <Icon size={32} strokeWidth={2} />
            </div>
            <div className="flex min-h-[3.5rem] flex-col items-center justify-center gap-1 text-center">
              <span className="text-base md:text-lg font-bold text-gray-800 leading-snug">
                {choice.title}
              </span>
              <span className="text-xs md:text-sm font-medium text-gray-500 leading-snug">
                {choice.subtitle}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
