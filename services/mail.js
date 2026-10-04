// mail.js — Email Service (Nodemailer + Gmail)
'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Formats a number with commas for display (e.g. 1234567 → "1,234,567").
 */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/**
 * Formats a publish date string into a readable format.
 */
function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generates the HTML email body from an array of video objects.
 *
 * @param {Array} videos - Array of video objects from youtube.js
 * @returns {string} Full HTML string for the email
 */
function buildEmailHTML(videos) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const videoCards = videos
    .map(
      (v, index) => `
    <!-- Video Card #${index + 1} -->
    <tr>
      <td style="padding: 0 0 28px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                 border-radius: 16px; overflow: hidden;
                 border: 1px solid rgba(99, 102, 241, 0.25);
                 box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <!-- Rank badge -->
            <td width="52" valign="top"
              style="padding: 20px 0 20px 20px; vertical-align: top;">
              <div style="width: 36px; height: 36px; border-radius: 50%;
                          background: linear-gradient(135deg, #6366f1, #a855f7);
                          display: flex; align-items: center; justify-content: center;
                          font-family: 'Segoe UI', Arial, sans-serif;
                          font-size: 15px; font-weight: 800; color: #fff;
                          text-align: center; line-height: 36px;">
                ${index + 1}
              </div>
            </td>
            <!-- Content -->
            <td style="padding: 20px 20px 20px 12px; vertical-align: top;">
              <!-- Title -->
              <a href="${v.url}" target="_blank"
                style="font-family: 'Segoe UI', Arial, sans-serif;
                       font-size: 17px; font-weight: 700; color: #e2e8f0;
                       text-decoration: none; line-height: 1.4; display: block;
                       margin-bottom: 6px;">
                ${v.title}
              </a>
              <!-- Channel & Date -->
              <p style="margin: 0 0 12px 0; font-family: 'Segoe UI', Arial, sans-serif;
                         font-size: 13px; color: #a78bfa;">
                📺 ${v.channelTitle}
                &nbsp;·&nbsp;
                <span style="color: #94a3b8;">${formatDate(v.publishedAt)}</span>
                &nbsp;·&nbsp;
                <span style="color: #94a3b8;">⏱ ${v.duration}</span>
              </p>
              <!-- Description -->
              ${
                v.description
                  ? `<p style="margin: 0 0 14px 0; font-family: 'Segoe UI', Arial, sans-serif;
                       font-size: 13px; color: #94a3b8; line-height: 1.6;">
                  ${v.description}${v.description.length >= 200 ? '…' : ''}
                </p>`
                  : ''
              }
              <!-- Stats pills -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 8px;">
                    <span style="display: inline-block; padding: 4px 12px;
                                 background: rgba(99,102,241,0.15);
                                 border: 1px solid rgba(99,102,241,0.3);
                                 border-radius: 999px; font-family: 'Segoe UI', Arial, sans-serif;
                                 font-size: 12px; color: #a5b4fc; white-space: nowrap;">
                      👁 ${formatNumber(v.viewCount)} views
                    </span>
                  </td>
                  <td style="padding-right: 8px;">
                    <span style="display: inline-block; padding: 4px 12px;
                                 background: rgba(168,85,247,0.15);
                                 border: 1px solid rgba(168,85,247,0.3);
                                 border-radius: 999px; font-family: 'Segoe UI', Arial, sans-serif;
                                 font-size: 12px; color: #d8b4fe; white-space: nowrap;">
                      👍 ${formatNumber(v.likeCount)}
                    </span>
                  </td>
                  <td>
                    <span style="display: inline-block; padding: 4px 12px;
                                 background: rgba(20,184,166,0.15);
                                 border: 1px solid rgba(20,184,166,0.3);
                                 border-radius: 999px; font-family: 'Segoe UI', Arial, sans-serif;
                                 font-size: 12px; color: #5eead4; white-space: nowrap;">
                      💬 ${formatNumber(v.commentCount)}
                    </span>
                  </td>
                </tr>
              </table>
              <!-- Watch button -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px;">
                <tr>
                  <td>
                    <a href="${v.url}" target="_blank"
                      style="display: inline-block; padding: 10px 22px;
                             background: linear-gradient(135deg, #6366f1, #a855f7);
                             color: #fff; font-family: 'Segoe UI', Arial, sans-serif;
                             font-size: 13px; font-weight: 600; text-decoration: none;
                             border-radius: 8px; letter-spacing: 0.3px;">
                      ▶ Watch on YouTube
                    </a>
                  </td>
                </tr>
              </table>
            </td>
            <!-- Thumbnail -->
            ${
              v.thumbnail
                ? `<td width="200" style="padding: 20px 20px 20px 0; vertical-align: top;">
              <a href="${v.url}" target="_blank">
                <img src="${v.thumbnail}" width="180" alt="${v.title}"
                  style="display: block; border-radius: 10px;
                         border: 2px solid rgba(99,102,241,0.25);
                         width: 180px; height: auto;" />
              </a>
            </td>`
                : ''
            }
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI YouTube Digest — ${today}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: 'Segoe UI', Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color: #0a0a1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" border="0"
          style="max-width: 680px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom: 32px; text-align: center;">
              <div style="display: inline-block; padding: 4px 16px;
                          background: rgba(99,102,241,0.15);
                          border: 1px solid rgba(99,102,241,0.35);
                          border-radius: 999px; margin-bottom: 16px;">
                <span style="font-size: 12px; font-weight: 600; color: #a5b4fc;
                              letter-spacing: 1.5px; text-transform: uppercase;">
                  Daily AI Digest
                </span>
              </div>
              <h1 style="margin: 0 0 8px 0; font-size: 36px; font-weight: 800;
                          background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
                          -webkit-background-clip: text; color: #a855f7;
                          line-height: 1.2;">
                🤖 Top AI Videos Today
              </h1>
              <p style="margin: 0; font-size: 14px; color: #64748b;">${today}</p>
            </td>
          </tr>

          <!-- Subtitle bar -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1));
                       border-radius: 12px; border: 1px solid rgba(99,102,241,0.2);">
                <tr>
                  <td style="padding: 16px 24px; text-align: center;">
                    <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                      Here are the <strong style="color: #a5b4fc;">${videos.length} most-watched AI videos</strong>
                      from the past 48 hours, curated automatically by your YouTube AI Agent.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Video cards -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${videoCards}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 16px; border-top: 1px solid rgba(99,102,241,0.15); text-align: center;">
              <p style="margin: 20px 0 6px 0; font-size: 13px; color: #475569;">
                Sent automatically by your <strong style="color: #a5b4fc;">YouTube AI Agent</strong>
              </p>
              <p style="margin: 0; font-size: 12px; color: #334155;">
                Powered by YouTube Data API v3 &amp; Nodemailer
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * Sends the daily AI video digest email.
 *
 * @param {Array} videos - Array of video objects from youtube.js
 * @returns {Promise<void>}
 */
async function sendDigestEmail(videos) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  const mailTo = process.env.MAIL_TO;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and/or GMAIL_PASS are not set in your .env file.');
  }
  if (!mailTo) {
    throw new Error('MAIL_TO is not set in your .env file.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const html = buildEmailHTML(videos);

  const info = await transporter.sendMail({
    from: `"YouTube AI Agent 🤖" <${user}>`,
    to: mailTo,
    subject: `🤖 Top AI Videos — ${today}`,
    html,
  });

  console.log(`[Mail] Email sent! Message ID: ${info.messageId}`);
}

module.exports = { sendDigestEmail };
