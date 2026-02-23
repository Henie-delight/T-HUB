// /api/news.js — Vercel Serverless Function
// 인도 경제 긍정 뉴스 프록시 + 한글 번역

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const API_KEY = process.env.NEWS_API_KEY || 'b64c8a10c7d84a24b4e034c825a87b1e';
    const ARTICLE_COUNT = 5;

    // 1개월 전 날짜
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const fromDate = oneMonthAgo.toISOString().split('T')[0];

    // NewsAPI 호출
    const query = '(India economy) AND (growth OR boom OR surge OR recovery OR positive OR optimistic OR expansion OR investment OR GDP)';
    const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`;

    const newsRes = await fetch(apiUrl);
    const newsData = await newsRes.json();

    if (newsData.status === 'error') {
      return res.status(502).json({ error: 'NewsAPI error', message: newsData.message });
    }

    if (!newsData.articles || newsData.articles.length === 0) {
      return res.status(200).json({ articles: [] });
    }

    // 긍정 키워드 필터링
    const positiveKeywords = [
      'growth', 'grow', 'surge', 'boom', 'rise', 'rising', 'gain',
      'positive', 'optimistic', 'recovery', 'expand', 'expansion',
      'investment', 'opportunity', 'record', 'high', 'strong',
      'boost', 'improve', 'momentum', 'bullish', 'upbeat', 'robust',
      'profit', 'revenue', 'success', 'promising', 'thrive', 'accelerat'
    ];
    const negativeKeywords = [
      'crash', 'crisis', 'collapse', 'recession', 'slump',
      'downturn', 'plunge', 'fear', 'warning', 'threat', 'decline',
      'risk', 'concern', 'trouble', 'worst', 'loss', 'deficit'
    ];

    const scored = newsData.articles
      .filter(a => a.title && a.title !== '[Removed]')
      .map(article => {
        const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
        let score = 0;
        positiveKeywords.forEach(kw => { if (text.includes(kw)) score += 1; });
        negativeKeywords.forEach(kw => { if (text.includes(kw)) score -= 2; });
        return { ...article, _score: score };
      })
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score || new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, ARTICLE_COUNT);

    // 제목 한글 번역
    const translatedArticles = await Promise.all(
      scored.map(async (article) => {
        try {
          const translated = await translateToKorean(article.title);
          return {
            title: article.title,
            titleKo: translated,
            description: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: article.source
          };
        } catch (e) {
          return {
            title: article.title,
            titleKo: article.title, // 번역 실패 시 원문 유지
            description: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: article.source
          };
        }
      })
    );

    // 5분 캐싱
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ articles: translatedArticles });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

// Google Translate 비공식 API를 이용한 번역
async function translateToKorean(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  const data = await response.json();

  // 응답 구조: [[["번역문","원문",...],...],...]
  if (data && data[0]) {
    return data[0].map(item => item[0]).join('');
  }
  return text;
}
