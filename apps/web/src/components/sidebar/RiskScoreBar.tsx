function riskColor(score: number): string {
  if (score >= 7.5) return '#e84545';
  if (score >= 5.5) return '#f28c2a';
  if (score >= 3.0) return '#f5c542';
  return '#3ecf8e';
}

export function RiskScoreBar({ score }: { score: number }) {
  const color = riskColor(score);
  const pct = Math.min(100, Math.max(0, score * 10));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-text-secondary">Risk Score</span>
        <span className="font-bold" style={{ color }}>
          {score.toFixed(1)}/10
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
