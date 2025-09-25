// api/brevo-join.js
export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { email, phone, plan = {}, utm = {}, pageUrl = '', referrer = '' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const listId = parseInt(process.env.BREVO_LIST_ID, 10);

    // Attributs alignés avec Brevo (tu as PORTION au singulier + PHONE)
    const attrs = {
      PORTION:         plan.portions,
      RECIPES:         plan.recipes,
      TOTAL_PORTIONS:  plan.total,
      PRICE_PORTION:   plan.pricePerPortion,
      TOTAL_WEEKLY:    plan.totalWeekly,
      CURRENCY:        plan.currency || 'EUR',
      MOOD:            plan.mood,
      PLAN_SUMMARY:    plan.summary,
      PHONE:           phone || '',
      SMS:             phone ? String(phone).replace(/\s+/g,'') : '',

      // Tracking si tu as créé ces attributs
      UTM_SOURCE:   utm.source || '',
      UTM_MEDIUM:   utm.medium || '',
      UTM_CAMPAIGN: utm.campaign || '',
      UTM_TERM:     utm.term || '',
      UTM_CONTENT:  utm.content || '',
      PAGE_URL:     pageUrl,
      REFERRER:     referrer
    };
    Object.keys(attrs).forEach(k => (attrs[k] === undefined || attrs[k] === '') && delete attrs[k]);

    async function upsertContact(attributes) {
      return fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ email, listIds: [listId], updateEnabled: true, attributes })
      });
    }

    let r = await upsertContact(attrs);

    // si un attribut manque côté Brevo, repli minimal pour ne pas bloquer
    if (r.status === 400) {
      const txt = await r.text();
      if (/attribute/i.test(txt) && /not found|unknown/i.test(txt)) {
        r = await upsertContact({ PLAN_SUMMARY: attrs.PLAN_SUMMARY, PHONE: attrs.PHONE, SMS: attrs.SMS });
      } else {
        return res.status(400).json({ error: txt || 'Bad Request' });
      }
    }

    if (r.ok) return res.status(200).json({ ok: true });
    return res.status(r.status).json({ error: await r.text() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
