const { TwitterApi } = require('twitter-api-v2');

const isTrue = (v) => ['1','true','yes','on'].includes(String(v||'').toLowerCase());
const ENABLED = isTrue(process.env.TWITTER_ENABLED);
const DRY_RUN = isTrue(process.env.TWITTER_DRY_RUN);

function getClient() {
  if (!ENABLED) {
    console.warn('[tweet] twitter disabled via TWITTER_ENABLED');
    return null;
  }
  const {
    TWITTER_API_KEY: appKey,
    TWITTER_API_KEY_SECRET: appSecret,
    TWITTER_ACCESS_TOKEN: accessToken,
    TWITTER_ACCESS_SECRET: accessSecret
  } = process.env;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.warn('[tweet] missing twitter env vars; tweeting disabled');
    return null;
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function postTweet(text) {
  if (DRY_RUN) {
    const id = 'dry_' + Date.now();
    const url = `https://x.com/i/web/status/${id}`;
    console.log('[tweet] DRY RUN →', text);
    return { id, url };
  }

  const client = getClient();
  if (!client) return null;

  const { data } = await client.v2.tweet(text);
  return { id: data.id, url: `https://x.com/i/web/status/${data.id}` };
}

module.exports = { postTweet };
