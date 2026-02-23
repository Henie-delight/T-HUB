// /api/news.js — Vercel Serverless Function
// 인도 경제 긍정 전망 뉴스 전용 프록시 + 한글 번역

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

    // ───────────────────────────────────────────
    // 1단계: 여러 타겟 쿼리로 폭넓게 수집
    // ───────────────────────────────────────────
    const queries = [
      'India GDP growth forecast',
      'India economy boom expansion',
      'India investment surge record',
      'India economic outlook positive',
      'India market rally bullish',
      'India FDI growth inflow'
    ];

    let allArticles = [];

    for (const query of queries) {
      try {
        const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=relevancy&language=en&pageSize=10&apiKey=${API_KEY}`;
        const newsRes = await fetch(apiUrl);
        const newsData = await newsRes.json();
        if (newsData.articles) {
          allArticles = allArticles.concat(newsData.articles);
        }
      } catch (e) {
        console.warn('Query failed:', query, e.message);
      }
    }

    // URL 기준 중복 제거
    const seen = new Set();
    allArticles = allArticles.filter(a => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    if (allArticles.length === 0) {
      return res.status(200).json({ articles: [] });
    }

    // ───────────────────────────────────────────
    // 2단계: 엄격한 3중 필터링
    // ───────────────────────────────────────────

    // [필터 A] 제목에 인도 관련 키워드 필수
    const indiaTerms = [
      'india', 'indian', 'mumbai', 'delhi', 'bengaluru', 'bangalore',
      'sensex', 'nifty', 'bse', 'nse', 'rupee', 'rbi',
      'modi', 'make in india'
    ];

    // [필터 B] 제목에 경제/금융 키워드 필수
    const econTerms = [
      'economy', 'economic', 'gdp', 'growth', 'market', 'trade',
      'investment', 'investor', 'fdi', 'export', 'import',
      'manufacturing', 'infrastructure', 'stock', 'fiscal',
      'revenue', 'profit', 'sector', 'industry', 'business',
      'startup', 'fintech', 'banking', 'fund', 'equity',
      'rally', 'bull', 'ipo', 'forex', 'billion', 'trillion'
    ];

    // [필터 C] 제목+설명에 긍정 키워드 (점수화)
    const positiveTerms = [
      'growth', 'grow', 'surge', 'boom', 'rise', 'rising', 'soar',
      'record', 'high', 'highest', 'strong', 'robust', 'resilient',
      'boost', 'expand', 'expansion', 'accelerat', 'momentum',
      'optimistic', 'positive', 'upbeat', 'bullish', 'outperform',
      'opportunity', 'promising', 'thrive', 'flourish', 'recover',
      'attract', 'inflow', 'upgrade', 'bright', 'confidence',
      'beat', 'exceed', 'milestone', 'breakthrough', 'success',
      'double', 'triple', 'fastest', 'leading', 'top'
    ];

    // [필터 D] 부정 키워드 (강한 감점)
    const negativeTerms = [
      'crash', 'crisis', 'collapse', 'recession', 'slump', 'slow',
      'downturn', 'plunge', 'plummet', 'fear', 'panic', 'warning',
      'threat', 'decline', 'drop', 'fall', 'falling', 'weak',
      'trouble', 'worst', 'loss', 'deficit', 'debt', 'default',
      'scandal', 'fraud', 'corruption', 'protest', 'strike',
      'concern', 'worry', 'uncertain', 'volatile', 'inflation'
    ];

    // [필터 E] 비경제 주제 제외
    const excludeTerms = [
      'cricket', 'bollywood', 'movie', 'film', 'celebrity', 'wedding',
      'murder', 'rape', 'accident', 'earthquake', 'flood', 'drought',
      'religion', 'temple', 'mosque', 'church', 'caste',
      'physiological', 'biochemical', 'cashew', 'agricultural stress',
      'court ruling', 'supreme court', 'verdict', 'sentence'
    ];

    const scored = [];

    for (const article of allArticles) {
      if (!article.title || article.title === '[Removed]') continue;

      const title = (article.title || '').toLowerCase();
      const desc = (article.description || '').toLowerCase();
      const fullText = title + ' ' + desc;

      // ── 필수조건 1: 제목에 인도 키워드 ──
      const hasIndia = indiaTerms.some(t => title.includes(t));
      if (!hasIndia) continue;

      // ── 필수조건 2: 제목에 경제 키워드 ──
      const hasEcon = econTerms.some(t => title.includes(t));
      if (!hasEcon) continue;

      // ── 제외조건: 비경제 주제 ──
      const isExcluded = excludeTerms.some(t => fullText.includes(t));
      if (isExcluded) continue;

      // ── 점수 계산 ──
      let score = 0;

      // 제목에 긍정 키워드 → 높은 가중치 (+3)
      positiveTerms.forEach(t => { if (title.includes(t)) score += 3; });

      // 설명에 긍정 키워드 → 낮은 가중치 (+1)
      positiveTerms.forEach(t => { if (desc.includes(t)) score += 1; });

      // 부정 키워드 → 강한 감점
      negativeTerms.forEach(t => { if (title.includes(t)) score -= 5; });
      negativeTerms.forEach(t => { if (desc.includes(t)) score -= 2; });

      // 최종 점수 > 0 인 기사만 통과
      if (score > 0) {
        scored.push({ ...article, _score: score });
      }
    }

    // 점수 높은 순 + 최신순 정렬
    scored.sort((a, b) => b._score - a._score || new Date(b.publishedAt) - new Date(a.publishedAt));
    const topArticles = scored.slice(0, ARTICLE_COUNT);

    if (topArticles.length === 0) {
      return res.status(200).json({ articles: [] });
    }

    // ───────────────────────────────────────────
    // 3단계: 제목 한글 번역
    // ───────────────────────────────────────────
    const translatedArticles = await Promise.all(
      topArticles.map(async (article) => {
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
            titleKo: article.title,
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

// Google Translate 비공식 API
async function translateToKorean(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data && data[0]) {
    return data[0].map(item => item[0]).join('');
  }
  return text;
}
