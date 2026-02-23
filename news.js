// /api/news.js — Vercel Serverless Function
// 인도 경제 긍정 뉴스 프록시 API

export default async function handler(req, res) {
  // CORS 허용 (아임웹 도메인에서 호출 가능하도록)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 요청만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const API_KEY = process.env.NEWS_API_KEY || 'b64c8a10c7d84a24b4e034c825a87b1e';

    // 1개월 전 날짜 계산
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const fromDate = oneMonthAgo.toISOString().split('T')[0];

    // 쿼리 파라미터
    const query = req.query.q || '(India economy) AND (growth OR boom OR surge OR recovery OR positive OR optimistic OR expansion OR investment OR GDP)';
    const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 50);

    const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=${pageSize}&apiKey=${API_KEY}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status === 'error') {
      return res.status(502).json({
        error: 'NewsAPI error',
        message: data.message || 'Unknown error'
      });
    }

    // 5분 캐싱 (동일 요청 반복 방지)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
