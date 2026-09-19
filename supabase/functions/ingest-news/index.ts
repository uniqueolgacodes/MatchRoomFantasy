// RSS news ingest. Runs every 30 minutes. PRD §19.2.
// No API-Football/football-data.org budget involved — RSS feeds are
// free and unlimited.

import { supabase } from '../_shared/clients.ts';
import Parser from 'npm:rss-parser@3';

const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', source: 'BBC Sport' },
  { url: 'https://www.theguardian.com/football/rss', source: 'The Guardian' },
  { url: 'https://www.skysports.com/rss/12040', source: 'Sky Sports' },
  { url: 'https://www.espn.com/espn/rss/soccer/news', source: 'ESPN' },
];

const TEAM_KEYWORDS: Record<string, string[]> = {
  arsenal: ['arsenal', 'gunners', 'arteta', 'emirates'],
  chelsea: ['chelsea', 'blues', 'stamford bridge'],
  liverpool: ['liverpool', 'reds', 'anfield'],
  man_united: ['man united', 'manchester united', 'red devils', 'old trafford'],
  man_city: ['man city', 'manchester city', 'citizens', 'etihad'],
  tottenham: ['tottenham', 'spurs'],
  newcastle: ['newcastle', 'magpies'],
  aston_villa: ['aston villa', 'villa', 'villans'],
  brighton: ['brighton', 'seagulls'],
  west_ham: ['west ham', 'hammers'],
  everton: ['everton', 'toffees'],
  crystal_palace: ['crystal palace', 'palace', 'eagles'],
  fulham: ['fulham', 'cottagers'],
  brentford: ['brentford', 'bees'],
  wolves: ['wolves', 'wolverhampton'],
  nottingham_forest: ['nottingham forest', 'forest'],
  bournemouth: ['bournemouth', 'cherries'],
  leicester: ['leicester', 'foxes'],
  ipswich: ['ipswich', 'tractor boys'],
  southampton: ['southampton', 'saints'],
};

function extractTeams(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(TEAM_KEYWORDS)
    .filter(([, kw]) => kw.some((k) => lower.includes(k)))
    .map(([team]) => team);
}

Deno.serve(async () => {
  const parser = new Parser();
  const articles: any[] = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items.slice(0, 20)) {
        const combined = `${item.title} ${item.contentSnippet ?? ''}`;
        articles.push({
          title: item.title,
          summary: item.contentSnippet?.slice(0, 300) ?? null,
          url: item.link,
          image_url: item.enclosure?.url ?? null,
          source: feed.source,
          published_at: new Date(item.pubDate ?? Date.now()).toISOString(),
          team_ids: extractTeams(combined),
        });
      }
    } catch (err) {
      console.error(`feed failed: ${feed.url}`, err);
    }
  }

  if (articles.length > 0) {
    await supabase.from('news_articles').upsert(articles, { onConflict: 'url', ignoreDuplicates: true });
  }

  return Response.json({ inserted: articles.length });
});
