// Generates a branded HTML report from project data.
// Opened in the user's default browser; can be printed to PDF from there.
import type { ProjectMeta, ProjectStats, AIODomainPivotRow, TopicRow, TopicKeywordRow } from '../../types'

export interface ReportData {
  meta: ProjectMeta
  stats: ProjectStats
  pivot: AIODomainPivotRow[]   // top domains × positions 1-10
  topics: { topic: TopicRow; keywords: TopicKeywordRow[] }[]
  generatedAt: number
}

const INTENT_COLORS: Record<string, string> = {
  informational:  '#3b82f6',
  commercial:     '#d97706',
  transactional:  '#16a34a',
  navigational:   '#6b7280',
}

export function buildReportHTML(d: ReportData): string {
  const date = new Date(d.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const topDomains = d.pivot.slice(0, 25)

  const topicSections = d.topics.map(({ topic, keywords }) => {
    const kwRows = keywords.map(kw => {
      const intentColor = kw.searchIntent ? (INTENT_COLORS[kw.searchIntent] ?? '#6b7280') : ''
      const intentBadge = kw.searchIntent
        ? `<span style="background:${intentColor}22;color:${intentColor};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:500;text-transform:capitalize;white-space:nowrap">${kw.searchIntent}</span>`
        : ''
      const vol = kw.searchVolume != null
        ? `<span style="color:#6b7280;font-size:11px">${kw.searchVolume.toLocaleString()}/mo</span>`
        : ''
      return `<tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;color:#111">${kw.keyword}</td>
        <td style="padding:5px 10px;text-align:right">${vol}</td>
        <td style="padding:5px 0">${intentBadge}</td>
      </tr>`
    }).join('')

    const topDomainBadge = topic.topDomain
      ? `<span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace">${topic.topDomain} ×${topic.topDomainCount}</span>`
      : '—'
    const bestDomainBadge = topic.bestDomain
      ? `<span style="background:#1d4ed8;color:#fff;border-radius:3px;padding:2px 6px;font-size:11px;font-weight:bold;margin-right:4px">${topic.bestDomainPosition}</span><span style="font-size:11px;font-family:monospace">${topic.bestDomain}</span>`
      : '—'

    const traffic = topic.totalSearchVolume != null
      ? topic.totalSearchVolume.toLocaleString() + '/mo'
      : '—'

    return `
    <div style="break-inside:avoid;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600;color:#111">${escHtml(topic.label)}</span>
        <span style="font-size:11px;color:#6b7280">${topic.memberCount} keywords</span>
        <span style="font-size:11px;color:#6b7280">Est. traffic: <strong style="color:#111">${traffic}</strong></span>
        <span style="font-size:11px;color:#6b7280;margin-left:auto">Most shown: ${topDomainBadge}</span>
        <span style="font-size:11px;color:#6b7280">Highest rank: ${bestDomainBadge}</span>
      </div>
      <div style="padding:12px 16px">
        <table style="width:100%;border-collapse:collapse">
          ${kwRows || '<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0">No keywords loaded</td></tr>'}
        </table>
      </div>
    </div>`
  }).join('')

  const positionHeaders = [1,2,3,4,5,6,7,8,9,10].map(p =>
    `<th style="${thStyle}text-align:center">Pos ${p}</th>`
  ).join('')

  const domainRows = topDomains.map(row => {
    const cells = [row.pos1,row.pos2,row.pos3,row.pos4,row.pos5,row.pos6,row.pos7,row.pos8,row.pos9,row.pos10].map(v => {
      const heat = Math.min(v / Math.max(row.totalAppearances, 1), 1)
      const bg = heat > 0.5 ? '#1d4ed8' : heat > 0.2 ? '#3b82f6' : heat > 0 ? '#bfdbfe' : 'transparent'
      const color = heat > 0.2 ? '#fff' : heat > 0 ? '#1e40af' : '#d1d5db'
      return `<td style="padding:5px 8px;text-align:center;background:${bg};color:${color};font-size:11px;font-weight:${v > 0 ? 600 : 400}">${v > 0 ? v : '—'}</td>`
    }).join('')
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 10px 6px 0;font-size:12px;font-family:monospace;color:#111;white-space:nowrap">${escHtml(row.domain)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#1d4ed8">${row.visibilityScore.toLocaleString()}</td>
      ${cells}
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIO Audit Report — ${escHtml(d.meta.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.5}
  @media print{body{padding:0}.no-print{display:none}@page{margin:20mm}}
</style>
</head>
<body style="max-width:1100px;margin:0 auto;padding:40px 32px">

  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #111">
    <div>
      <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Tombo Group · AIO Audit Tool</div>
      <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:4px">${escHtml(d.meta.name)}</h1>
      <div style="font-size:12px;color:#6b7280">Generated ${date} · ${escHtml(locationLabel(d.meta.locationCode))} · ${escHtml(d.meta.languageCode.toUpperCase())} · ${escHtml(d.meta.device)}</div>
    </div>
  </div>

  <!-- Summary stats -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:36px">
    ${statCard('Total Keywords', d.stats.totalKeywords.toLocaleString(), '#111')}
    ${statCard('Keywords with AIO', d.stats.keywordsWithAIO.toLocaleString(), '#1d4ed8')}
    ${statCard('Unique AIO Domains', d.stats.uniqueDomains.toLocaleString(), '#111')}
    ${statCard('Errors', d.stats.errorKeywords.toLocaleString(), d.stats.errorKeywords > 0 ? '#dc2626' : '#6b7280')}
  </div>

  <!-- AIO Domain Visibility -->
  <h2 style="font-size:15px;font-weight:600;color:#111;margin-bottom:12px">AIO Domain Visibility</h2>
  <p style="font-size:11px;color:#6b7280;margin-bottom:12px">Visibility score = Σ(11 − position) across all appearances. Top 25 domains shown.</p>
  <div style="overflow-x:auto;margin-bottom:40px;border:1px solid #e5e7eb;border-radius:8px">
    <table style="width:100%;border-collapse:collapse;min-width:700px">
      <thead>
        <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
          <th style="${thStyle}text-align:left">Domain</th>
          <th style="${thStyle}text-align:right">Score</th>
          ${positionHeaders}
        </tr>
      </thead>
      <tbody>${domainRows || '<tr><td colspan="12" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">No AIO data yet</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Topic Clusters -->
  <h2 style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px">Topic Clusters</h2>
  <p style="font-size:11px;color:#6b7280;margin-bottom:16px">${d.topics.length} clusters · ${d.stats.totalKeywords.toLocaleString()} total keywords</p>
  ${topicSections || '<p style="color:#9ca3af;font-size:12px">No clusters yet. Run clustering in the app first.</p>'}

  <!-- Footer -->
  <div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    AIO Audit Tool by Tombo Group · tombogroup.com
  </div>

</body>
</html>`
}

const thStyle = 'padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;white-space:nowrap;'

function statCard(label: string, value: string, color: string): string {
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px">
    <div style="font-size:11px;color:#6b7280;margin-bottom:4px">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color}">${value}</div>
  </div>`
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function locationLabel(code: number): string {
  const map: Record<number, string> = {
    2840:'United States', 2826:'United Kingdom', 2036:'Australia',
    2124:'Canada', 2276:'Germany', 2250:'France', 2724:'Spain',
    2380:'Italy', 2528:'Netherlands', 2702:'Singapore'
  }
  return map[code] ?? String(code)
}
