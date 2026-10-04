// services/youtube.js — YouTube Data API Service (v2 — India + Smart Semantic Filter)
// Improvements over v1:
//   • regionCode = "IN" for India-specific results
//   • Up to 3 pages per query (150 results each) via nextPageToken
//   • order=viewCount for accuracy over order=date
//   • Manual 48-hour publishedAt verification (in addition to API param)
//   • Duration filter raised to ≥ 8 minutes (480s)
//   • Full semantic relevance scoring (AI cluster + DEV cluster + tutorial intent)
//   • Exclusion penalties (news, stocks, motivation, art)
//   • Language restriction removed — allows Hindi + English
//   • 10-step debug pipeline with counts at every stage
//   • Minimum quality check on top result
'use strict';

require('dotenv').config();
const axios = require('axios');

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
const YOUTUBE_API_BASE      = 'https://www.googleapis.com/youtube/v3';
const API_KEY               = process.env.YOUTUBE_API_KEY;
const MAX_RESULTS_PER_QUERY = 50;    // YouTube API max per search request
const PAGES_PER_QUERY       = 3;     // Fetch up to 3 pages = 150 results per keyword
const TOP_N                 = 10;    // Final videos to return
const HOURS_WINDOW          = 48;    // Look-back window in hours
const MIN_DURATION_SEC      = 480;   // 8 minutes — exclude Shorts & short clips
const MIN_RELEVANCE_SCORE   = 3;     // Minimum semantic score to pass filter
const MIN_VIEWS_QUALITY     = 5000;  // Quality check threshold for top video
const REGION_CODE           = 'IN';  // India only

// ─────────────────────────────────────────────
//  Search Queries
// ─────────────────────────────────────────────

/**
 * Six topic queries as specified in the project requirements.
 * Each is paginated independently (up to 3 pages each).
 */
const SEARCH_QUERIES = [
  'AI agent tutorial',
  'AI app development',
  'AI game development',
  'AI automation tools',
  'build app using AI',
  'no code AI agent',
];

// ─────────────────────────────────────────────
//  Semantic Keyword Clusters
// ─────────────────────────────────────────────

/**
 * AI-related terms.
 * A video matching any of these gets +2 to relevance score.
 * A video MUST match at least one AI term to qualify.
 */
const AI_TERMS = [
  'ai', ' gpt', 'gemini', 'claude', 'llm', 'ai agent', 'automation',
  'chatgpt', 'openai', 'copilot', 'langchain', 'rag', 'hugging face',
  'artificial intelligence', 'generative ai', 'gen ai', 'stable diffusion',
  'machine learning', 'deep learning', 'neural', 'diffusion model',
  'mistral', 'llama', 'anthropic', 'groq',
];

/**
 * Development / build intent terms.
 * A video matching any of these gets +2 to relevance score.
 * A video MUST match at least one DEV term to qualify.
 */
const DEV_TERMS = [
  'build', 'create', 'tutorial', 'step by step', 'full guide', 'coding',
  'development', 'android', 'ios', 'mobile app', 'web app', 'app',
  'game', 'saas', 'workflow', 'api', 'bot', 'software', 'project',
  'deploy', 'integrate', 'integration', 'course', 'learn', 'how to',
  'walkthrough', 'from scratch', 'beginner', 'hands on', 'demo',
  'tool', 'platform', 'no code', 'low code', 'automate', 'pipeline',
  'agent', 'plugin', 'extension', 'full stack', 'backend', 'frontend',
];

/**
 * Tutorial / guide intent terms.
 * Matching any of these adds +1 to relevance score.
 */
const TUTORIAL_TERMS = [
  'tutorial', 'guide', 'course', 'step by step', 'how to', 'walkthrough',
  'from scratch', 'beginner', 'hands on', 'full', 'complete', 'part 1',
  'episode', 'series', 'learn', 'explain', 'master',
];

/**
 * Exclusion terms — off-topic content.
 * Matching any of these applies a -3 penalty to relevance score.
 */
const EXCLUDE_TERMS = [
  'stock market', 'stocks', 'trading', 'finance', 'crypto', 'bitcoin',
  'news', 'breaking news', 'prediction', 'future of ai', 'ai will replace',
  'motivation', 'mindset', 'philosophy', 'ai art', 'midjourney art',
  'business ideas', 'make money', 'passive income', 'freelance tips',
  'interview questions', 'resume', 'job tips',
];

// ─────────────────────────────────────────────
//  Semantic Scoring Engine
// ─────────────────────────────────────────────

/**
 * Evaluates a video's relevance to AI development content using a
 * cluster-based scoring system. Checks both title and description.
 *
 * Rules:
 *   - Must contain ≥1 AI term AND ≥1 DEV term to be eligible at all
 *   - AI term match          → +2
 *   - DEV term match         → +2
 *   - Tutorial intent match  → +1
 *   - Exclusion term match   → -3
 *   - Final score must be ≥ MIN_RELEVANCE_SCORE
 *
 * @param {Object} video - Formatted video object
 * @returns {{ passes: boolean, score: number, matchedAI: string, matchedDev: string }}
 */
function scoreVideo(video) {
  // Use title + first 300 chars of description as the searchable text
  const haystack = `${video.title} ${video.description}`.toLowerCase();

  let score = 0;

  // AI cluster check (+2)
  const matchedAI = AI_TERMS.find((t) => haystack.includes(t)) || null;
  if (matchedAI) score += 2;

  // DEV cluster check (+2)
  const matchedDev = DEV_TERMS.find((t) => haystack.includes(t)) || null;
  if (matchedDev) score += 2;

  // Tutorial intent bonus (+1)
  const matchedTutorial = TUTORIAL_TERMS.find((t) => haystack.includes(t)) || null;
  if (matchedTutorial) score += 1;

  // Exclusion penalty (-3)
  const matchedExclusion = EXCLUDE_TERMS.find((t) => haystack.includes(t)) || null;
  if (matchedExclusion) score -= 3;

  // Hard gate: must have BOTH an AI match AND a DEV match
  const passes = !!matchedAI && !!matchedDev && score >= MIN_RELEVANCE_SCORE;

  return { passes, score, matchedAI, matchedDev, matchedExclusion };
}

// ─────────────────────────────────────────────
//  Main Export
// ─────────────────────────────────────────────

/**
 * Fetches the top AI-related YouTube videos from the last 48 hours in India.
 *
 * Pipeline:
 *  Step 1  → Build publishedAfter timestamp (48h ago)
 *  Step 2  → Run all 6 queries × up to 3 pages each, in parallel
 *  Step 3  → Merge all collected video IDs
 *  Step 4  → Deduplicate by videoId
 *  Step 5  → Fetch full details (snippet + statistics + contentDetails)
 *  Step 6  → Manual 48-hour publishedAt verification
 *  Step 7  → Duration filter (≥ 8 minutes only)
 *  Step 8  → Semantic relevance scoring — drop off-topic videos
 *  Step 9  → Sort by viewCount descending, take top 10
 *  Step 10 → Minimum quality check + final debug summary
 *
 * @returns {Promise<Array>} Top 10 relevant video objects
 */
async function fetchTopAIVideos() {
  if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not set. Please add it to your .env file.');
  }

  const now          = Date.now();
  const cutoffMs     = now - HOURS_WINDOW * 60 * 60 * 1000;
  const publishedAfter = getPublishedAfterTimestamp(HOURS_WINDOW);

  // ── Banner ───────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   YouTube AI Agent v2 — India Edition (Smart Filter)    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Region          : ${REGION_CODE} (India)`);
  console.log(`  Language        : Hindi + English (unrestricted)`);
  console.log(`  Search window   : Last ${HOURS_WINDOW} hours`);
  console.log(`  Published after : ${publishedAfter}`);
  console.log(`  Queries         : ${SEARCH_QUERIES.length} topics × ${PAGES_PER_QUERY} pages = up to ${SEARCH_QUERIES.length * PAGES_PER_QUERY * MAX_RESULTS_PER_QUERY} raw results`);
  console.log(`  Min duration    : ${MIN_DURATION_SEC / 60} minutes`);
  console.log(`  Min rel. score  : ${MIN_RELEVANCE_SCORE} / 5`);
  console.log('');

  // ── Step 1-2: Paginated search across all 6 queries ──────────────────
  console.log(`[Step 1/10] Fetching videos from YouTube (${SEARCH_QUERIES.length} queries × up to ${PAGES_PER_QUERY} pages)...`);
  const searchResults = await Promise.allSettled(
    SEARCH_QUERIES.map((q) => searchVideosPaginated(q, publishedAfter))
  );

  // ── Step 3: Merge all results ─────────────────────────────────────────
  const allVideoIds = [];
  searchResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`  ✅  "${SEARCH_QUERIES[i]}" → ${result.value.length} IDs collected`);
      allVideoIds.push(...result.value);
    } else {
      console.warn(`  ⚠️   "${SEARCH_QUERIES[i]}" → FAILED: ${result.reason?.message}`);
    }
  });

  console.log(`\n[Step 3/10] Total raw IDs (with duplicates): ${allVideoIds.length}`);

  // ── Step 4: Deduplicate ───────────────────────────────────────────────
  const uniqueIds = [...new Set(allVideoIds)];
  console.log(`[Step 4/10] Unique IDs after deduplication: ${uniqueIds.length}`);

  if (uniqueIds.length === 0) {
    console.warn('\n[Agent] No videos found. Exiting.');
    return [];
  }

  // ── Step 5: Fetch full video details ──────────────────────────────────
  console.log(`\n[Step 5/10] Fetching full details for ${uniqueIds.length} videos...`);
  const allVideos = await fetchVideoDetails(uniqueIds);
  console.log(`  → Details fetched for: ${allVideos.length} videos`);

  // ── Step 6: Manual 48-hour publishedAt verification ───────────────────
  const within48h = allVideos.filter((v) => {
    const pubMs = new Date(v.publishedAt).getTime();
    return pubMs >= cutoffMs;
  });
  console.log(`\n[Step 6/10] Manual 48-hour publishedAt check:`);
  console.log(`  → Removed: ${allVideos.length - within48h.length} older videos`);
  console.log(`  → Remaining: ${within48h.length} videos`);

  // ── Step 7: Duration filter (≥ 8 min) ────────────────────────────────
  const longForm = within48h.filter((v) => v.durationSec >= MIN_DURATION_SEC);
  console.log(`\n[Step 7/10] Duration filter (≥ ${MIN_DURATION_SEC / 60} min):`);
  console.log(`  → Removed: ${within48h.length - longForm.length} short videos / Shorts`);
  console.log(`  → Remaining: ${longForm.length} long-form videos`);

  // ── Step 8: Semantic relevance scoring ────────────────────────────────
  console.log(`\n[Step 8/10] Applying semantic relevance scoring (threshold: ${MIN_RELEVANCE_SCORE}/5)...`);

  const scored = longForm.map((v) => {
    const result = scoreVideo(v);
    return { ...v, ...result };
  });

  const relevant = scored.filter((v) => v.passes);
  const rejected = scored.filter((v) => !v.passes);

  console.log(`  → Passed (relevant):   ${relevant.length}`);
  console.log(`  → Rejected (off-topic): ${rejected.length}`);

  if (rejected.length > 0 && rejected.length <= 10) {
    // Show a sample of rejected titles for transparency
    console.log('  → Sample rejections:');
    rejected.slice(0, 5).forEach((v) => {
      console.log(`     ✗ [score: ${v.score}] ${v.title.slice(0, 60)}`);
      if (v.matchedExclusion) console.log(`       Reason: excluded term "${v.matchedExclusion}"`);
      else if (!v.matchedAI)  console.log(`       Reason: no AI term matched`);
      else if (!v.matchedDev) console.log(`       Reason: no DEV term matched`);
    });
  }

  // Fallback: if zero pass semantic filter, use best long-form videos
  const pool = relevant.length > 0 ? relevant : longForm;
  if (relevant.length === 0) {
    console.warn('\n⚠️  [Fallback] No videos passed semantic filter.');
    console.warn('   Using top long-form videos by view count as fallback.');
  }

  // ── Step 9: Sort by viewCount, pick top N ─────────────────────────────
  const sorted = pool.sort((a, b) => b.viewCount - a.viewCount);
  const top10  = sorted.slice(0, TOP_N);

  console.log(`\n[Step 9/10] Sorted by view count. Selected top ${top10.length}.`);

  // ── Step 10: Minimum quality check + final summary ────────────────────
  if (top10.length > 0 && top10[0].viewCount < MIN_VIEWS_QUALITY) {
    console.warn(
      `\n⚠️  [Step 10/10 — Quality Check] Top video has only ` +
      `${top10[0].viewCount.toLocaleString('en-IN')} views ` +
      `(threshold: ${MIN_VIEWS_QUALITY.toLocaleString()}).`
    );
    console.warn('   Consider expanding the search window or adding more queries.');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  FINAL TOP 10 — India | AI-Dev | Last 48 Hours          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  top10.forEach((v, i) => {
    const views    = v.viewCount.toLocaleString('en-IN');
    const score    = v.relevanceScore !== undefined ? v.score : 'N/A';
    const title    = v.title.length > 52 ? v.title.slice(0, 51) + '…' : v.title;
    console.log(`║  ${String(i + 1).padStart(2, ' ')}. [Score:${String(score).padStart(2)}] [${v.duration.padEnd(7)}] [${views.padStart(10)} views]`);
    console.log(`║      ${title}`);
    console.log('║');
  });
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  return top10;
}

// ─────────────────────────────────────────────
//  Helper: Paginated Search (up to N pages)
// ─────────────────────────────────────────────

/**
 * Searches YouTube for a single query with pagination.
 * Fetches up to PAGES_PER_QUERY pages using nextPageToken.
 * Uses order=viewCount to surface highest-viewed content first.
 * Uses regionCode=IN for India-specific results.
 * Language restriction is intentionally removed to allow Hindi + English.
 *
 * @param {string} query          - Search term
 * @param {string} publishedAfter - ISO 8601 timestamp
 * @returns {Promise<string[]>}   - All collected video IDs for this query
 */
async function searchVideosPaginated(query, publishedAfter) {
  const allIds      = [];
  let pageToken     = undefined;
  let pagesFetched  = 0;

  while (pagesFetched < PAGES_PER_QUERY) {
    const params = {
      part:           'id',
      q:              query,
      type:           'video',
      order:          'viewCount',       // Highest-viewed first (changed from 'date')
      publishedAfter: publishedAfter,
      maxResults:     MAX_RESULTS_PER_QUERY,
      regionCode:     REGION_CODE,       // India only
      key:            API_KEY,
    };

    if (pageToken) params.pageToken = pageToken;

    const response = await axios.get(`${YOUTUBE_API_BASE}/search`, { params });
    const items    = response.data.items || [];
    const ids      = items.map((item) => item.id?.videoId).filter(Boolean);

    allIds.push(...ids);
    pagesFetched++;

    // Advance to next page or stop if no more pages
    pageToken = response.data.nextPageToken;
    if (!pageToken) break;
  }

  return allIds;
}

// ─────────────────────────────────────────────
//  Helper: Fetch Full Video Details (batched)
// ─────────────────────────────────────────────

/**
 * Fetches full video details (snippet + statistics + contentDetails)
 * for an array of videoIds. Batched in groups of 50 (API limit).
 *
 * @param {string[]} videoIds - Array of YouTube video IDs
 * @returns {Promise<Array>}  - Array of formatted video objects
 */
async function fetchVideoDetails(videoIds) {
  const BATCH_SIZE  = 50;
  const batches     = [];

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    batches.push(videoIds.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      axios.get(`${YOUTUBE_API_BASE}/videos`, {
        params: {
          part: 'snippet,statistics,contentDetails',
          id:   batch.join(','),
          key:  API_KEY,
        },
      })
    )
  );

  const allItems = batchResults.flatMap((res) => res.data.items || []);
  return allItems.map(formatVideo);
}

// ─────────────────────────────────────────────
//  Helper: Format Raw API Video Object
// ─────────────────────────────────────────────

/**
 * Maps a raw YouTube API video item into a clean, structured object.
 * Description is extended to 300 chars (was 200) for better semantic matching.
 *
 * @param {Object} item - Raw YouTube API video item
 * @returns {Object}    - Clean video object
 */
function formatVideo(item) {
  const snippet = item.snippet        || {};
  const stats   = item.statistics     || {};
  const content = item.contentDetails || {};

  // Highest quality thumbnail available
  const thumb =
    snippet.thumbnails?.maxres   ||
    snippet.thumbnails?.standard ||
    snippet.thumbnails?.high     ||
    snippet.thumbnails?.medium   ||
    {};

  return {
    id:           item.id,
    title:        snippet.title        || 'Untitled',
    channelTitle: snippet.channelTitle || 'Unknown Channel',
    description:  (snippet.description || '').slice(0, 300).trim(), // Extended to 300 chars
    publishedAt:  snippet.publishedAt  || '',
    thumbnail:    thumb.url            || '',
    url:          `https://www.youtube.com/watch?v=${item.id}`,
    viewCount:    parseInt(stats.viewCount    || '0', 10),
    likeCount:    parseInt(stats.likeCount    || '0', 10),
    commentCount: parseInt(stats.commentCount || '0', 10),
    duration:     parseDuration(content.duration || 'PT0S'),
    durationSec:  parseDurationToSeconds(content.duration || 'PT0S'),
  };
}

// ─────────────────────────────────────────────
//  Helper: Build publishedAfter Timestamp
// ─────────────────────────────────────────────

/**
 * Returns an ISO 8601 timestamp for N hours ago (UTC).
 *
 * @param {number} hours - How many hours to look back
 * @returns {string}     - e.g. "2024-01-15T10:30:00.000Z"
 */
function getPublishedAfterTimestamp(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ─────────────────────────────────────────────
//  Helper: ISO 8601 Duration Parsers
// ─────────────────────────────────────────────

/**
 * Converts ISO 8601 duration to human-readable string.
 * "PT14M33S" → "14:33" | "PT1H2M5S" → "1:02:05"
 */
function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Converts ISO 8601 duration to total seconds.
 * Used for the duration filter.
 */
function parseDurationToSeconds(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

// ─────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────
module.exports = { fetchTopAIVideos };
