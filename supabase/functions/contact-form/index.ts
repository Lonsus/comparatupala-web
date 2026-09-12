const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://comparatupala.es',
  'https://www.comparatupala.es',
  'http://localhost:8000'
];

function allowedOrigins() {
  const configured = (Deno.env.get('CONTACT_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins().has(origin) ? origin : '';
  return {
    ...(allowed ? {'Access-Control-Allow-Origin': allowed} : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8'}
  });
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char] || char));
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    if (origin && !allowedOrigins().has(origin)) return new Response(null, {status: 403});
    return new Response(null, {status: 204, headers: cors});
  }

  if (request.method !== 'POST') return jsonResponse({ok: false, error: 'method_not_allowed'}, 405, origin);
  if (origin && !allowedOrigins().has(origin)) return jsonResponse({ok: false, error: 'origin_not_allowed'}, 403, origin);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    return jsonResponse({ok: false, error: 'payload_too_large'}, 413, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ok: false, error: 'invalid_json'}, 400, origin);
  }

  const name = clean(body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const subject = clean(body.subject, 120);
  const message = clean(body.message, 3000);
  const website = clean(body.website, 200);

  // Honeypot: answer successfully so automated submitters do not learn how the trap works.
  if (website) return jsonResponse({ok: true}, 200, origin);

  if (!validEmail(email) || !subject || message.length < 10) {
    return jsonResponse({ok: false, error: 'invalid_input'}, 400, origin);
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL');
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL');
  const fromName = Deno.env.get('CONTACT_FROM_NAME') || 'ComparaTuPala';

  if (!apiKey || !fromEmail || !toEmail) {
    console.error('Contact form is missing required server-side configuration.');
    return jsonResponse({ok: false, error: 'service_unavailable'}, 503, origin);
  }

  const displayName = name || 'Visitante de ComparaTuPala';
  const receivedAt = new Date().toISOString();
  const textContent = [
    `Nombre: ${displayName}`,
    `Email de respuesta: ${email}`,
    `Motivo: ${subject}`,
    `Recibido: ${receivedAt}`,
    '',
    message
  ].join('\n');

  const htmlContent = `
    <h2>Nuevo mensaje desde ComparaTuPala</h2>
    <p><strong>Nombre:</strong> ${escapeHtml(displayName)}</p>
    <p><strong>Email de respuesta:</strong> ${escapeHtml(email)}</p>
    <p><strong>Motivo:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Recibido:</strong> ${escapeHtml(receivedAt)}</p>
    <hr>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {name: fromName, email: fromEmail},
        to: [{email: toEmail, name: 'ComparaTuPala'}],
        replyTo: {email, name: displayName},
        subject: `[Contacto web] ${subject}`,
        textContent,
        htmlContent,
        tags: ['contact-form']
      })
    });

    if (!response.ok) {
      console.error('Brevo rejected contact email.', {status: response.status});
      return jsonResponse({ok: false, error: 'delivery_failed'}, 502, origin);
    }

    return jsonResponse({ok: true}, 200, origin);
  } catch (error) {
    console.error('Contact email delivery failed.', error instanceof Error ? error.message : 'unknown_error');
    return jsonResponse({ok: false, error: 'delivery_failed'}, 502, origin);
  }
});
