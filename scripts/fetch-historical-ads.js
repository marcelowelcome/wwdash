require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchMonth(token, year, month) {
  const startDate = year + '-' + String(month).padStart(2, '0') + '-01';
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const res = await fetch(
    'https://googleads.googleapis.com/v20/customers/' + customerId + '/googleAds:search',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks FROM customer WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
      }),
    }
  );
  return res.json();
}

async function main() {
  const token = await getToken();
  console.log('Token obtained');

  const months = [];
  // 2026: Jan, Feb, Mar
  for (let m = 1; m <= 3; m++) months.push({ year: 2026, month: m });
  // 2025: all months
  for (let m = 12; m >= 1; m--) months.push({ year: 2025, month: m });
  // 2024: all months
  for (let m = 12; m >= 1; m--) months.push({ year: 2024, month: m });

  for (const { year, month } of months) {
    try {
      const data = await fetchMonth(token, year, month);

      if (data.error) {
        console.log(year + '/' + month + ': Error - ' + (data.error.message || '').substring(0, 50));
        continue;
      }

      if (!data.results || data.results.length === 0) {
        console.log(year + '/' + month + ': No data');
        continue;
      }

      const metrics = data.results[0].metrics;
      const spend = parseInt(metrics.costMicros || '0') / 1000000;
      const clicks = parseInt(metrics.clicks || '0');
      const impressions = parseInt(metrics.impressions || '0');
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

      console.log(year + '/' + month + ': R$ ' + spend.toFixed(2) + ' | ' + clicks + ' clicks | ' + impressions + ' imp');

      await supabase.from('ads_spend_cache').upsert({
        year,
        month,
        source: 'google_ads',
        pipeline: 'wedding',
        spend,
        impressions,
        clicks,
        cpc,
        cpm,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'year,month,source,pipeline' });

    } catch (e) {
      console.log(year + '/' + month + ': Exception - ' + e.message);
    }
  }

  console.log('Done!');
}

main();
