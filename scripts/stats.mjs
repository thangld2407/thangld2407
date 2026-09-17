// Renders GitHub stats and top-language cards (light + dark) into ./dist.
// Runs in GitHub Actions with the built-in GITHUB_TOKEN; no third-party service involved.
//   GITHUB_TOKEN=... GH_LOGIN=thangdev0724 node scripts/stats.mjs
//   MOCK=1 node scripts/stats.mjs        (render with sample data, for previewing locally)
import { mkdirSync, writeFileSync } from 'node:fs'

const LOGIN = process.env.GH_LOGIN ?? 'thangdev0724'
const OUT = 'dist'

const themes = {
  light: { bg: '#FFFDF9', border: '#E3DDD2', title: '#94600F', text: '#1B1F27', muted: '#5E6472', track: '#EFEAE1' },
  dark: { bg: '#16233B', border: '#2A3A55', title: '#E0A43B', text: '#EDE7DC', muted: '#9AA6BA', track: '#22304A' },
}
// Language shares use one amber-to-navy ramp instead of GitHub's rainbow, to match the résumé site.
const ramp = ['#E0A43B', '#C98A2B', '#A8802F', '#7D8BA3', '#56668A', '#34445F']

const QUERY = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection { totalCommitContributions restrictedContributionsCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, privacy: PUBLIC) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
      }
    }
  }
}`

async function fetchData() {
  if (process.env.MOCK) {
    return {
      stars: 12, commits: 342, prs: 27, issues: 9, repos: 18, followers: 21,
      languages: [['Vue', 41], ['JavaScript', 27], ['TypeScript', 14], ['Java', 9], ['SCSS', 6], ['HTML', 3]],
    }
  }
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json))

  const user = json.data.user
  const bytes = new Map()
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) bytes.set(node.name, (bytes.get(node.name) ?? 0) + size)
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1
  const languages = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, size]) => [name, Math.round((size / total) * 1000) / 10])

  return {
    stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
    commits: user.contributionsCollection.totalCommitContributions + user.contributionsCollection.restrictedContributionsCount,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    repos: user.repositories.totalCount,
    followers: user.followers.totalCount,
    languages,
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function frame(c, title, body, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}" viewBox="0 0 480 ${height}" role="img" aria-label="${esc(title)}">
  <style>
    .sans { font-family: Arial, Helvetica, sans-serif; }
    .row { opacity: 0; animation: rise 0.5s ease-out forwards; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .row { animation: none; opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="479" height="${height - 1}" rx="12" fill="${c.bg}" stroke="${c.border}"/>
  <text class="sans" x="28" y="40" font-size="11" font-weight="bold" letter-spacing="2.6" fill="${c.title}">${esc(title.toUpperCase())}</text>
  <rect x="28" y="50" width="32" height="3" fill="#E0A43B"/>
${body}
</svg>
`
}

function statsCard(c, d) {
  const rows = [
    ['Commits (last 12 months)', d.commits],
    ['Pull requests', d.prs],
    ['Issues', d.issues],
    ['Public repositories', d.repos],
    ['Stars earned', d.stars],
  ]
  const body = rows
    .map(([label, value], i) => {
      const y = 88 + i * 26
      return `  <g class="row" style="animation-delay:${(0.1 + i * 0.08).toFixed(2)}s">
    <rect x="28" y="${y - 8}" width="6" height="6" fill="#E0A43B"/>
    <text class="sans" x="44" y="${y}" font-size="14" fill="${c.muted}">${esc(label)}</text>
    <text class="sans" x="452" y="${y}" font-size="14" font-weight="bold" fill="${c.text}" text-anchor="end">${value.toLocaleString('en-US')}</text>
  </g>`
    })
    .join('\n')
  return frame(c, 'GitHub activity', body, 215)
}

function languagesCard(c, d) {
  if (!d.languages.length) {
    return frame(c, 'Top languages', `  <text class="sans" x="28" y="92" font-size="14" fill="${c.muted}">No public code yet.</text>`, 215)
  }
  const barWidth = 424
  let x = 28
  const segments = d.languages
    .map(([, pct], i) => {
      const w = Math.max(2, (pct / 100) * barWidth)
      const seg = `<rect x="${x.toFixed(1)}" y="76" width="${w.toFixed(1)}" height="10" fill="${ramp[i]}"/>`
      x += w
      return seg
    })
    .join('')
  const legend = d.languages
    .map(([name, pct], i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const lx = 28 + col * 222
      const ly = 122 + row * 28
      return `  <g class="row" style="animation-delay:${(0.2 + i * 0.07).toFixed(2)}s">
    <circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${ramp[i]}"/>
    <text class="sans" x="${lx + 18}" y="${ly}" font-size="14" fill="${c.text}">${esc(name)}</text>
    <text class="sans" x="${lx + 196}" y="${ly}" font-size="13" fill="${c.muted}" text-anchor="end">${pct}%</text>
  </g>`
    })
    .join('\n')
  const body = `  <clipPath id="bar"><rect x="28" y="76" width="${barWidth}" height="10" rx="5"/></clipPath>
  <rect x="28" y="76" width="${barWidth}" height="10" rx="5" fill="${c.track}"/>
  <g clip-path="url(#bar)">${segments}</g>
${legend}`
  return frame(c, 'Top languages', body, 215)
}

const data = await fetchData()
mkdirSync(OUT, { recursive: true })
for (const [name, colors] of Object.entries(themes)) {
  const suffix = name === 'dark' ? '-dark' : ''
  writeFileSync(`${OUT}/stats${suffix}.svg`, statsCard(colors, data))
  writeFileSync(`${OUT}/top-langs${suffix}.svg`, languagesCard(colors, data))
}
console.log('Rendered cards for', LOGIN, JSON.stringify(data))
