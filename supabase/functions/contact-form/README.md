# Contact form Edge Function

The public contact form calls the Supabase Edge Function `contact-form`. The browser never receives the Brevo credential.

## Required secrets

Configure these as Supabase Edge Function secrets:

- `BREVO_API_KEY`: Brevo API key used only by the Edge Function.
- `CONTACT_FROM_EMAIL`: authenticated sender in Brevo, for example `no-reply@comparatupala.es`.
- `CONTACT_TO_EMAIL`: inbox that receives contact messages.
- `CONTACT_FROM_NAME`: optional; defaults to `ComparaTuPala`.
- `CONTACT_ALLOWED_ORIGINS`: optional comma-separated override. Defaults to `https://comparatupala.es,https://www.comparatupala.es,http://localhost:8000`.

Do not put any of these secret values in frontend JavaScript or commit them to Git.

## Deploy

This form is intentionally public, so deploy the function without JWT verification:

```bash
supabase functions deploy contact-form --no-verify-jwt
```

Secrets can be configured with the Supabase CLI or from the Supabase dashboard before deploying. A CLI example is:

```bash
supabase secrets set BREVO_API_KEY="..." CONTACT_FROM_EMAIL="no-reply@comparatupala.es" CONTACT_TO_EMAIL="..." CONTACT_FROM_NAME="ComparaTuPala"
```

The frontend invokes the function through the existing Supabase client. The function validates field lengths and email format, restricts browser origins, includes a honeypot field, and sends the message through Brevo with the visitor address as `replyTo`.

The 30-second resend cooldown in the frontend is a usability safeguard, not a server-side security boundary. If public abuse becomes material, add a server-verifiable CAPTCHA/Turnstile challenge or persistent server-side rate limiting.
