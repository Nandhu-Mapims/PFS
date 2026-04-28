import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Mic, Square, Languages, Loader } from "lucide-react";

type RecordingState = 'idle' | 'recording' | 'processing' | 'completed';

export function VoiceFeedback() {
  const navigate = useNavigate();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState('');

  const toggleRecording = () => {
    if (recordingState === 'idle') {
      setRecordingState('recording');
      setLiveText('');
      // Simulate live transcription
      simulateLiveTranscription();
    } else if (recordingState === 'recording') {
      setRecordingState('processing');
      setTimeout(() => {
        setTranscript(liveText);
        setRecordingState('completed');
      }, 1500);
    }
  };

  const simulateLiveTranscription = () => {
    const sampleText = "The waiting time was long but the doctor was very helpful and explained everything clearly...";
    let index = 0;
    const interval = setInterval(() => {
      if (index < sampleText.length) {
        setLiveText(prev => prev + sampleText[index]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);
  };

  const handleSubmit = () => {
    navigate('/thank-you');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            Voice Feedback
          </h2>
          <div className="flex items-center justify-center gap-2 text-gray-600 bg-[#F5F7FA] px-6 py-3 rounded-full inline-flex">
            <Languages size={24} />
            <p className="text-base md:text-lg font-medium">
              Supports Tamil & English
            </p>
          </div>
        </div>

        {/* Recording Interface */}
        <div className="flex flex-col items-center gap-8 mb-10">
          {/* State Display */}
          <div className="text-center min-h-[60px]">
            <p className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">
              {recordingState === 'idle' && 'Tap to Speak'}
              {recordingState === 'recording' && 'Listening...'}
              {recordingState === 'processing' && 'Processing...'}
              {recordingState === 'completed' && 'Recording Complete'}
            </p>
            {recordingState === 'recording' && (
              <p className="text-base text-gray-600">
                Tap again to stop
              </p>
            )}
          </div>

          {/* Microphone Button */}
          <div className="relative">
            <button
              onClick={toggleRecording}
              disabled={recordingState === 'processing'}
              className={`relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                recordingState === 'recording'
                  ? 'bg-[#E5533D] hover:bg-[#d43e29]'
                  : recordingState === 'processing'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-[#2A6FDB] hover:bg-[#1e5bbd] hover:scale-110'
              }`}
            >
              {recordingState === 'processing' ? (
                <Loader size={64} className="text-white animate-spin" />
              ) : recordingState === 'recording' ? (
                <Square size={64} className="text-white" fill="white" />
              ) : (
                <Mic size={64} className="text-white" strokeWidth={2} />
              )}

              {/* Pulse Animation */}
              {recordingState === 'recording' && (
                <>
                  <div className="absolute inset-0 rounded-full border-4 border-[#E5533D] animate-ping opacity-75" />
                  <div className="absolute inset-0 rounded-full border-4 border-[#E5533D] animate-pulse" />
                </>
              )}
            </button>
          </div>

          {/* Waveform Visualization */}
          {recordingState === 'recording' && (
            <div className="flex items-center gap-1 h-20">
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-[#2A6FDB] rounded-full"
                  style={{
                    height: `${Math.random() * 60 + 20}px`,
                    animation: `pulse 0.8s ease-in-out infinite`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Text Preview */}
        {(liveText || transcript) && (
          <div className="mb-8 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="bg-[#F5F7FA] rounded-2xl p-6 border-2 border-gray-200 min-h-[120px]">
              <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                {recordingState === 'recording' ? liveText : transcript}
                {recordingState === 'recording' && (
                  <span className="inline-block w-1 h-5 bg-[#2A6FDB] ml-1 animate-pulse"></span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {recordingState === 'completed' && (
          <button
            onClick={handleSubmit}
            className="w-full bg-[#2FBF71] text-white text-2xl md:text-3xl py-6 md:py-8 rounded-2xl font-bold shadow-lg hover:bg-[#28a962] hover:shadow-xl hover:scale-[1.02] transition-all duration-200 mb-6 animate-in fade-in slide-in-from-bottom duration-300"
          >
            Submit Feedback
          </button>
        )}

        {/* Back Link */}
        <div className="text-center">
          <button
            onClick={() => navigate('/feedback-mode')}
            className="text-gray-500 hover:text-[#2A6FDB] text-lg transition-colors"
          >
            ← Choose Different Method
          </button>
        </div>
      </div>
    </div>
  );
}
