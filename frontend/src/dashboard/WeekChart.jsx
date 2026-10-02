import { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { localeOf } from '../lib/format.js';
import { weekFromTurns } from '../lib/stats.js';

// Answers per day, last seven days. One hue, bars anchored to the baseline,
// today labelled directly; every bar has a tooltip and the numbers are also
// in a table for screen readers.
const W = 560;
const H = 220;
const L = 30;
const R = 8;
const TOP = 28;
const B = 30;

export default function WeekChart({ turns }) {
  const { t, lang } = useI18n();
  const [hover, setHover] = useState(null);
  const data = weekFromTurns(turns);
  const total = data.reduce((s, d) => s + d.n, 0);
  const pw = W - L - R;
  const ph = H - TOP - B;
  const top = Math.max(4, Math.ceil(Math.max(...data.map((d) => d.n)) / 2) * 2);
  const y = (v) => TOP + ph - (v / top) * ph;
  const band = pw / 7;
  const bw = Math.min(40, band * 0.54);
  const short = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short' });
  const long = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'numeric' });
  const base = TOP + ph;

  return (
    <section className="panel chart-panel">
      <div className="panel-head"><h2>{t('chartTitle')}</h2><span className="total">{t('chartTotal', { n: total })}</span></div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t('chartTitle')}>
          {[0, top / 2, top].map((v) => (
            <g key={v}>
              <line className="grid-line" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text className="axis" x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = L + i * band + (band - bw) / 2;
            const yt = y(d.n);
            const h = base - yt;
            const r = Math.min(4, h);
            const tip = t('tip', { d: long.format(d.start), n: d.n });
            return (
              <g key={d.start}>
                {h > 0 && <path className="bar" d={`M${x} ${base} V${yt + r} Q${x} ${yt} ${x + r} ${yt} H${x + bw - r} Q${x + bw} ${yt} ${x + bw} ${yt + r} V${base} Z`} />}
                {d.today && <text className="val" x={x + bw / 2} y={yt - 8} textAnchor="middle">{d.n}</text>}
                <text className={`axis ${d.today ? 'today' : ''}`} x={x + bw / 2} y={H - 8} textAnchor="middle">{short.format(d.start)}</text>
                <rect
                  className="hit" x={L + i * band} y={TOP} width={band} height={ph} tabIndex={0} role="img" aria-label={tip}
                  onPointerEnter={() => setHover({ i, x: x + bw / 2, y: yt, tip })} onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover({ i, x: x + bw / 2, y: yt, tip })} onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
        {hover && <div className="tip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>{hover.tip}</div>}
        <table className="sr-only">
          <caption>{t('chartTable')}</caption>
          <tbody>{data.map((d) => <tr key={d.start}><th>{long.format(d.start)}</th><td>{d.n}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
