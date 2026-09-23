import { Card } from "@/lib/domain";
import { readinessLevel, scoreCard } from "@/lib/scoring";

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`score-badge level-${score < 40 ? 0 : score < 70 ? 1 : score < 90 ? 2 : 3}`}><strong>{score}</strong><span>{readinessLevel(score)}</span></span>;
}

export function ScorePanel({ card, official, previous, confirmedDelta }: { card: Card; official?: number; previous?: number; confirmedDelta?: number }) {
  const score = scoreCard(card);
  const delta = confirmedDelta ?? (previous === undefined ? undefined : score.total - previous);
  return <section className="panel score-panel">
    <span className="eyebrow">ГОТОВНОСТЬ К СОТРУДНИЧЕСТВУ</span>
    <h3>{official === undefined ? "Предварительный рейтинг" : "Подтверждённый рейтинг"}</h3>
    <div className="score-hero">
      <div className="score-ring" role="meter" aria-label="Рейтинг готовности" aria-valuenow={score.total} aria-valuemin={0} aria-valuemax={100} style={{ background: `conic-gradient(var(--accent) ${score.total}%, #e9f0f3 0)` }}>
        <div><strong>{score.total}</strong><span>/ 100</span></div>
      </div>
      <div><ScoreBadge score={score.total} /><p>Чем яснее задача,<br />тем проще начать.</p></div>
    </div>
    {delta !== undefined && <div className={`delta ${delta < 0 ? "delta-negative" : delta === 0 ? "delta-neutral" : ""}`}><strong>{delta > 0 ? "+" : ""}{delta}</strong><span>после подтверждения<small>к предыдущей подтверждённой версии</small></span></div>}
    <div className="score-section-label">Из чего складывается рейтинг</div>
    <div className="score-breakdown">{score.breakdown.map(c => <div key={c.name}>
      <div className="between"><span>{c.name}</span><b>{c.earned}<small> / {c.max}</small></b></div>
      <div className="bar"><i style={{ width: `${c.earned / c.max * 100}%` }} /></div>
      {c.criteria.some(x => !x.earned) && <p className="category-hint">{c.criteria.find(x => !x.earned)?.label}</p>}
      <details><summary>За что начислены баллы</summary>{c.criteria.map((x, i) => <p key={i}>{x.earned ? "✓" : "○"} {x.label}: {x.earned}/{x.max}</p>)}</details>
    </div>)}</div>
    {score.recommendations.length > 0 && <div className="recommendations"><h4>Как усилить задачу <span>+{100 - score.total} доступно</span></h4><ul>{score.recommendations.slice(0, 4).map(r => <li key={r}>{r}</li>)}</ul><small>Все условия — в разбивке выше.</small></div>}
    <p className="muted small">Рейтинг отражает заполненность карточки по открытым правилам, а не популярность бизнеса. Любая опубликованная задача доступна командам.</p>
  </section>;
}
