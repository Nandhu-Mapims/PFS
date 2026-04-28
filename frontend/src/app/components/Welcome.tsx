import { useNavigate } from "react-router";
import { UserCheck, Heart } from "lucide-react";

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 md:p-12 max-w-2xl w-full">
        {/* Illustration Area */}
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-[#2A6FDB] to-[#2FBF71] rounded-full flex items-center justify-center shadow-lg">
            <Heart className="w-16 h-16 text-white" fill="white" />
          </div>
          <div className="text-sm text-gray-500 mb-2">Service Completed</div>
        </div>

        {/* Main Message */}
        <h1 className="text-3xl md:text-4xl font-bold mb-3 text-gray-800">
          Thank you for visiting
        </h1>
        <h2 className="text-4xl md:text-5xl font-bold text-[#2A6FDB] mb-6">
          MAPIMS Hospital
        </h2>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-gray-600 mb-10 leading-relaxed">
          Your feedback helps us improve care
        </p>

        {/* Main CTA Button */}
        <button
          onClick={() => navigate('/feedback')}
          className="w-full bg-[#2A6FDB] text-white text-2xl md:text-3xl py-6 md:py-8 rounded-2xl font-bold shadow-lg hover:bg-[#1e5bbd] hover:shadow-xl hover:scale-[1.02] transition-all duration-200 mb-6"
        >
          Give Feedback
        </button>

        {/* Secondary Option */}
        <div className="flex items-center justify-center gap-3 p-5 bg-[#F5F7FA] rounded-xl border-2 border-gray-200">
          <UserCheck className="w-7 h-7 text-[#2A6FDB] flex-shrink-0" />
          <p className="text-base md:text-lg text-gray-700 font-medium">
            Staff can submit feedback for elder/uneducated patients
          </p>
        </div>

        {/* Staff Access */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => navigate('/login')}
            className="text-gray-400 hover:text-[#2A6FDB] text-sm transition-colors"
          >
            Staff Access →
          </button>
        </div>
      </div>
    </div>
  );
}
