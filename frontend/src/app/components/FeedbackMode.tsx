import { useNavigate } from "react-router";
import { UserCheck, MessageSquare, Users, Mic, Phone, FileText, Star } from "lucide-react";

const feedbackModes = [
  {
    id: 'staff',
    icon: UserCheck,
    title: 'Staff Assisted',
    description: 'Our staff will help you provide feedback',
    recommended: true,
    path: '/feedback-form'
  },
  {
    id: 'whatsapp',
    icon: MessageSquare,
    title: 'WhatsApp / SMS',
    description: 'Receive a link to give feedback later',
    recommended: false,
    path: '/feedback-form'
  },
  {
    id: 'attender',
    icon: Users,
    title: 'Attender Feedback',
    description: 'Feedback from family or caregiver',
    recommended: false,
    path: '/feedback-form'
  },
  {
    id: 'voice',
    icon: Mic,
    title: 'Voice Feedback',
    description: 'Speak your feedback in Tamil or English',
    recommended: false,
    path: '/voice-feedback'
  },
  {
    id: 'missed-call',
    icon: Phone,
    title: 'Missed Call',
    description: 'Give a missed call and we\'ll call back',
    recommended: false,
    path: '/feedback-form'
  },
  {
    id: 'paper',
    icon: FileText,
    title: 'Paper Feedback',
    description: 'Upload scanned feedback form',
    recommended: false,
    path: '/paper-upload'
  }
];

export function FeedbackMode() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3">
          Choose Feedback Method
        </h2>
        <p className="text-lg md:text-xl text-gray-600">
          Select how you'd like to share your experience
        </p>
      </div>

      {/* 2x3 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
        {feedbackModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              onClick={() => navigate(mode.path)}
              className={`relative bg-white border-2 rounded-2xl p-6 md:p-8 text-center transition-all duration-200 hover:scale-[1.03] hover:shadow-xl ${
                mode.recommended
                  ? 'border-[#2FBF71] shadow-lg ring-2 ring-[#2FBF71] ring-opacity-20'
                  : 'border-gray-200 shadow-md hover:border-[#2A6FDB]'
              }`}
            >
              {/* Recommended Badge */}
              {mode.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2FBF71] text-white px-4 py-1 rounded-full text-sm font-bold flex items-center gap-1 shadow-md">
                  <Star size={14} fill="white" />
                  Recommended
                </div>
              )}

              <div className="flex flex-col items-center gap-4">
                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center ${
                  mode.recommended ? 'bg-[#2FBF71]' : 'bg-[#2A6FDB]'
                } shadow-md`}>
                  <Icon size={44} className="text-white" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
                    {mode.title}
                  </h3>
                  <p className="text-sm md:text-base text-gray-600 leading-relaxed">
                    {mode.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("/welcome")}
          className="text-gray-500 hover:text-[#2A6FDB] text-lg transition-colors"
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
