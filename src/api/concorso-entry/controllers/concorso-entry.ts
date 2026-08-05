import { factories } from '@strapi/strapi';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface TurnstileResponse {
  success: boolean;
  [key: string]: unknown;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  });
  const data = (await res.json()) as TurnstileResponse;
  return data.success === true;
}

export default factories.createCoreController('api::concorso-entry.concorso-entry', ({ strapi }) => ({
  async register(ctx) {
    const { nome, cognome, email, telefono, note, consensoAccettato, captchaToken } = ctx.request.body || {};

    if (!nome || !cognome || !email || !telefono) {
      return ctx.badRequest('Dati anagrafici mancanti');
    }
    if (!consensoAccettato) {
      return ctx.badRequest('Devi accettare regolamento e privacy policy');
    }

    const captchaOk = await verifyTurnstile(captchaToken);
    if (!captchaOk) {
      return ctx.badRequest('Verifica captcha non riuscita');
    }

    const deadline = new Date('2026-08-31T23:59:59+02:00');
    if (new Date() > deadline) {
      return ctx.badRequest('Le iscrizioni al concorso sono chiuse');
    }

    const existing = await strapi.db.query('api::concorso-entry.concorso-entry').findOne({
      where: { $or: [{ email }, { telefono }] },
    });
    if (existing) {
      return ctx.badRequest('Esiste già una iscrizione con questa email o telefono');
    }

    const baseSlug = slugify(`${nome}-${cognome}`);
    let slug = baseSlug;
    let counter = 2;
    while (
      await strapi.db.query('api::concorso-entry.concorso-entry').findOne({ where: { cartellaSlug: slug } })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const entry = await strapi.db.query('api::concorso-entry.concorso-entry').create({
      data: {
        nome,
        cognome,
        email,
        telefono,
        note: note || null,
        consensoAccettato: true,
        cartellaSlug: slug,
        statoPagamento: 'in_attesa',
        importo: 10,
        publishedAt: new Date(),
      },
    });

    return ctx.send({ id: entry.id, cartellaSlug: entry.cartellaSlug });
  },
}));
