// services/youtube.js — YouTube Data API Service
// Phase 2 — Production Implementation
'use strict';

require('dotenv').config();
const axios = require('axios');

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const API_KEY          = process.env.YOUTUBE_API_KEY;
const MAX_RESULTS_PER_QUERY = 50;   // YouTube API max per search request
const TOP_N            = 10;         // Final number of videos to return
const HOURS_WINDOW     = 48;         // Look back 48 hours

/**
 * The 6 specific topic queries as specified in the project requirements.
 * Each query is searched independently, results are merged and deduplicated.
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
//  Main Export
// ─────────────────────────────────────────────

/**
 * Fetches the top AI-related YouTube videos from the last 48 hours.
 *
 * Execution flow:
 *  1. Build a publishedAfter timestamp (48 hours ago)
 *  2. Run all 6 topic queries in parallel (50 results each)
 *  3. Merge all results into one flat array
 *  4. Deduplicate by videoId
 *  5. Batch-fetch full statistics from the /videos endpoint
 *  6. Sort by viewCount (descending)
 *  7. Return the top 10
 *
 * @returns {Promise<Array>} Sorted array of the top 10 video objects
 */
async function fetchTopAIVideos() {
  if (!API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY is not set. Please add it to your .env file.'
    );
  }

  // ── Step 1: Build the 48-hour timestamp ─────────────────────────────
  const publishedAfter = getPublishedAfterTimestamp(HOURS_WINDOW);
  console.log(`\n[YouTube] Search window: last ${HOURS_WINDOW} hours`);
  console.log(`[YouTube] Published after: ${publishedAfter}`);
  console.log(`[YouTube] Running ${SEARCH_QUERIES.length} topic queries in parallel...\n`);

  // ── Step 2: Run all 6 queries in parallel ───────────────────────────
  const searchResults = await Promise.allSettled(
    SEARCH_QUERIES.map((query) => searchVideos(query, publishedAfter))
  );

  // ── Step 3: Merge all results ────────────────────────────────────────
  const allVideoIds = [];
  searchResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const ids = result.value;
      console.log(`  ✅ "${SEARCH_QUERIES[i]}" → ${ids.length} results`);
      allVideoIds.push(...ids);
    } else {
      console.warn(`  ⚠️  "${SEARCH_QUERIES[i]}" → failed: ${result.reason?.message}`);
    }
  });

  console.log(`\n[YouTube] Total raw results (with duplicates): ${allVideoIds.length}`);

  // ── Step 4: Deduplicate by videoId ──────────────────────────────────
  const uniqueIds = [...new Set(allVideoIds)];
  console.log(`[YouTube] Unique video IDs after deduplication: ${uniqueIds.length}`);

  if (uniqueIds.length === 0) {
    console.warn('[YouTube] No videos found in the last 48 hours.');
    return [];
  }

  // ── Step 5: Fetch full statistics in batches of 50 ──────────────────
  // The /videos endpoint accepts up to 50 IDs per request
  const videoDetails = await fetchVideoDetails(uniqueIds);
  console.log(`[YouTube] Fetched full details for ${videoDetails.length} videos.`);

  // ── Step 6 & 7: Sort by viewCount and return top N ──────────────────
  const top10 = videoDetails
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, TOP_N);

  console.log(`[YouTube] Returning top ${top10.length} videos by view count.\n`);
  return top10;
}

// ─────────────────────────────────────────────
//  Helper: Search Videos by Query
// ─────────────────────────────────────────────

/**
 * Calls the YouTube Search API for a single query.
 * Uses order=date so we get the most recent videos, not promoted ones.
 *
 * @param {string} query          - The search term
 * @param {string} publishedAfter - ISO 8601 timestamp
 * @returns {Promise<string[]>}   - Array of videoId strings
 */
async function searchVideos(query, publishedAfter) {
  const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
    params: {
      part:             'id',           // We only need the ID at this stage
      q:                query,
      type:             'video',
      order:            'date',         // Most recent first (spec requirement)
      publishedAfter:   publishedAfter,
      maxResults:       MAX_RESULTS_PER_QUERY,
      relevanceLanguage:'en',
      key:              API_KEY,
    },
  });

  return (response.data.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean); // Remove any undefined/null entries
}

// ─────────────────────────────────────────────
//  Helper: Fetch Full Video Details (batched)
// ─────────────────────────────────────────────

/**
 * Fetches full video details (snippet + statistics + contentDetails)
 * for an array of videoIds. Automatically batches into groups of 50
 * to respect YouTube API limits.
 *
 * @param {string[]} videoIds - Array of YouTube video IDs
 * @returns {Promise<Array>}  - Array of formatted video objects
 */
async function fetchVideoDetails(videoIds) {
  const BATCH_SIZE = 50;
  const batches = [];

  // Split IDs into batches of 50
  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    batches.push(videoIds.slice(i, i + BATCH_SIZE));
  }

  // Fetch all batches in parallel
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

  // Flatten and format
  const allItems = batchResults.flatMap((res) => res.data.items || []);
  return allItems.map(formatVideo);
}

// ─────────────────────────────────────────────
//  Helper: Format a Raw API Video Object
// ─────────────────────────────────────────────

/**
 * Maps a raw YouTube API video item into a clean, structured object
 * used by the rest of the application.
 *
 * @param {Object} item - Raw YouTube API video item
 * @returns {Object}    - Clean video object
 */
function formatVideo(item) {
  const snippet = item.snippet        || {};
  const stats   = item.statistics     || {};
  const content = item.contentDetails || {};

  // Pick the best available thumbnail (highest quality first)
  const thumb =
    snippet.thumbnails?.maxres  ||
    snippet.thumbnails?.standard||
    snippet.thumbnails?.high    ||
    snippet.thumbnails?.medium  ||
    {};

  return {
    id:           item.id,
    title:        snippet.title        || 'Untitled',
    channelTitle: snippet.channelTitle || 'Unknown Channel',
    description:  (snippet.description || '').slice(0, 200).trim(),
    publishedAt:  snippet.publishedAt  || '',
    thumbnail:    thumb.url            || '',
    url:          `https://www.youtube.com/watch?v=${item.id}`,
    viewCount:    parseInt(stats.viewCount    || '0', 10),
    likeCount:    parseInt(stats.likeCount    || '0', 10),
    commentCount: parseInt(stats.commentCount || '0', 10),
    duration:     parseDuration(content.duration || 'PT0S'),
  };
}

// ─────────────────────────────────────────────
//  Helper: Build publishedAfter Timestamp
// ─────────────────────────────────────────────

/**
 * Returns an ISO 8601 timestamp for N hours ago (in UTC).
 *
 * @param {number} hours - How many hours to look back
 * @returns {string}     - ISO 8601 string e.g. "2024-01-15T10:30:00.000Z"
 */
function getPublishedAfterTimestamp(hours) {
  const ms = hours * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

// ─────────────────────────────────────────────
//  Helper: Parse ISO 8601 Duration
// ─────────────────────────────────────────────

/**
 * Converts ISO 8601 duration string to human-readable format.
 * Examples: "PT14M33S" → "14:33", "PT1H2M5S" → "1:02:05"
 *
 * @param {string} iso - ISO 8601 duration string
 * @returns {string}   - Human-readable duration
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

// ─────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────
module.exports = { fetchTopAIVideos };
