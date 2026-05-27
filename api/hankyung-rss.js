const feedPaths = new Set([
  'all-news',
  'finance',
  'economy',
  'realestate',
  'it',
  'politics',
  'international',
  'society',
  'life',
  'opinion',
  'sports',
  'entertainment',
  'video',
])

const getFeedUrl = (request) => {
  const host = request.headers.host || 'localhost'
  const url = new URL(request.url || '/', `https://${host}`)
  const feedPath = url.searchParams.get('feed') || 'all-news'

  return `https://www.hankyung.com/feed/${feedPaths.has(feedPath) ? feedPath : 'all-news'}`
}

const textFromTag = (item, tagName) => {
  const match = item.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))

  if (!match) {
    return ''
  }

  return match[1]
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

const formatItems = (rssText) =>
  Array.from(rssText.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, 12)
    .map((match, index) => {
      const item = match[1]
      const title = textFromTag(item, 'title')
      const link = textFromTag(item, 'link')
      const description = textFromTag(item, 'description')
      const pubDate = textFromTag(item, 'pubDate')
      const guid = textFromTag(item, 'guid')

      return {
        id: guid || link || `${title}-${index}`,
        title,
        link,
        summary: description.length > 110 ? `${description.slice(0, 110)}...` : description,
        publishedAt: pubDate,
      }
    })
    .filter((item) => item.title && item.link)

export default async function handler(_request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (_request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  try {
    const hankyungRssUrl = getFeedUrl(_request)
    const rssResponse = await fetch(hankyungRssUrl, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml',
        'user-agent': 'GreenTalk RSS Reader',
      },
    })

    if (!rssResponse.ok) {
      response.status(502).json({ error: 'RSS request failed' })
      return
    }

    const rssText = await rssResponse.text()
    const items = formatItems(rssText)

    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')
    response.status(200).json({ items })
  } catch {
    response.status(500).json({ error: 'RSS request failed' })
  }
}
