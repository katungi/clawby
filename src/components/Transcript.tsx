interface TranscriptProps {
  userText: string;
  aiText: string;
}

export function Transcript({ userText, aiText }: TranscriptProps) {
  if (!userText && !aiText) return null;

  return (
    <div className="transcript">
      {userText && <div className="t-user">"{userText}"</div>}
      {aiText && <div className="t-ai">{aiText}</div>}
    </div>
  );
}
