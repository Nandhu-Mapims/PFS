/** Pre-recorded AI voice prompts (upload to uploads/feedback-voice/ai_voice/). */
export const AI_VOICE_DIR = "feedback-voice/ai_voice";

export const AI_VOICE_FILES = {
  intro: `${AI_VOICE_DIR}/intro.mp3`,
  questions: [
    `${AI_VOICE_DIR}/1stquestion.mp3`,
    `${AI_VOICE_DIR}/2ndquestion.mp3`,
    `${AI_VOICE_DIR}/3rdquestion.mp3`,
    `${AI_VOICE_DIR}/4thquestion.mp3`,
    `${AI_VOICE_DIR}/5thquestion.mp3`,
  ],
};

/** Default Tamil bot Q&A — plays matching audio from ai_voice when present. */
export const DEFAULT_BOT_CONVERSATION = {
  key: "default",
  introText:
    "வணக்கம்! MAPIMS மருத்துவமனையில் உங்கள் அனுபவத்தைப் பற்றி சில கேள்விகள் கேட்கிறோம். ஒவ்வொரு கேள்விக்கும் பிறகு சிறிது நேரம் யோசித்து, உங்கள் பதிலைச் சொல்லுங்கள்.",
  introAudioRelPath: AI_VOICE_FILES.intro,
  questions: [
    {
      order: 0,
      textTa: "இங்க வர பஸ் வேன் வசதி எப்படி இருந்துச்சு? எல்லாம் ஓகேவா இருந்துச்சா?",
      audioRelPath: AI_VOICE_FILES.questions[0],
    },
    {
      order: 1,
      textTa: "சரிங்க, இங்க பாத்ரூம் நல்லா சுத்தமா இருந்துச்சா?",
      audioRelPath: AI_VOICE_FILES.questions[1],
    },
    {
      order: 2,
      textTa: "டாக்டர் நல்லா பார்த்தாங்களா? பொறுமையா பேசினாங்களா?",
      audioRelPath: AI_VOICE_FILES.questions[2],
    },
    {
      order: 3,
      textTa: "இங்க வேலை பாக்குறவங்க நல்லா பேசினாங்களா? உதவி பண்ணாங்களா?",
      audioRelPath: AI_VOICE_FILES.questions[3],
    },
    {
      order: 4,
      textTa: "சரி, மொத்தமா இங்க வந்தது எப்படி இருந்துச்சு? திருப்தியா இருந்தீங்களா?",
      audioRelPath: AI_VOICE_FILES.questions[4],
    },
  ],
};

export function defaultQuestionAudioRelPath(order) {
  return AI_VOICE_FILES.questions[order] ?? null;
}
