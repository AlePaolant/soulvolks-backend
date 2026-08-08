import { factories } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface TurnstileResponse {
  success: boolean;
  [key: string]: unknown;
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PHOTOS = 4;
const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads', 'concorso');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sanitizeFilename(name: string): string {
  const base = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base.slice(0, 80) || 'foto';
}

function isRealJpeg(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(3);
  fs.readSync(fd, buffer, 0, 3, 0);
  fs.closeSync(fd);
  return buffer.equals(JPEG_MAGIC);
}
async function sendConfirmationEmail(entry: any) {
  const apiKey = process.env.BREVO_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'support@soulvolks.it';
  if (!apiKey || !entry.email) return;
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'Soul Volks', email: emailFrom },
        to: [{ email: entry.email, name: `${entry.nome} ${entry.cognome}` }],
        subject: 'Iscrizione al concorso fotografico ricevuta — Soul Volks',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#e2572b">Iscrizione ricevuta!</h2>
            <p>Ciao ${entry.nome},</p>
            <p>Le tue foto per il concorso <strong>Racconti visivi del Volks Camp 2026</strong> sono state ricevute correttamente. La partecipazione è gratuita, non devi fare altro.</p>
            <p>In bocca al lupo!</p>
            <p style="color:#888;font-size:13px">Soul Volks Club — Molise, Italia</p>
          </div>
        `,
      }),
    });
  } catch { /* non blocchiamo la risposta se l'invio fallisce */ }
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

function checkAdmin(ctx): boolean {
  const header = ctx.request.headers['x-admin-secret'];
  return !!header && header === process.env.CONCORSO_ADMIN_SECRET;
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
        nome, cognome, email, telefono,
        note: note || null,
        consensoAccettato: true,
        cartellaSlug: slug,
        statoPagamento: 'gratuito',
        importo: 0,
        publishedAt: new Date(),
      },
    });

    return ctx.send({ id: entry.id, documentId: entry.documentId, cartellaSlug: entry.cartellaSlug });
  },

  async uploadFoto(ctx) {
    const { id } = ctx.params;

    const entry = await strapi.db.query('api::concorso-entry.concorso-entry').findOne({
      where: { id },
      populate: ['foto'],
    });
    if (!entry) return ctx.notFound('Iscrizione non trovata');
    if (entry.foto && entry.foto.length > 0) {
      return ctx.badRequest('Foto già caricate per questa iscrizione');
    }

    const files = ctx.request.files;
    if (!files) return ctx.badRequest('Nessun file ricevuto');

    const fileList = Object.values(files).flat().filter(Boolean) as any[];
    if (fileList.length === 0) return ctx.badRequest('Nessun file ricevuto');
    if (fileList.length > MAX_PHOTOS) return ctx.badRequest(`Massimo ${MAX_PHOTOS} foto`);

    const titoli: string[] = [];
    for (let i = 1; i <= MAX_PHOTOS; i++) {
      titoli.push(ctx.request.body[`titolo${i}`] || '');
    }

    const uploadDir = path.join(UPLOADS_ROOT, entry.cartellaSlug);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fotoData = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_FILE_SIZE) {
        return ctx.badRequest(`Il file ${file.originalFilename} supera i 10MB`);
      }
      if (!isRealJpeg(file.filepath)) {
        return ctx.badRequest(`Il file ${file.originalFilename} non è un JPG valido`);
      }
      const titolo = titoli[i] ? sanitizeFilename(titoli[i]) : '';
      const baseName = titolo || sanitizeFilename(path.parse(file.originalFilename).name);
      const finalName = `${String(i + 1).padStart(2, '0')}-${baseName}.jpg`;
      const destPath = path.join(uploadDir, finalName);
      fs.copyFileSync(file.filepath, destPath);
      fotoData.push({
        nomeFile: finalName,
        titolo: titoli[i] || null,
        nomeOriginale: file.originalFilename,
        path: `concorso/${entry.cartellaSlug}/${finalName}`,
      });
    }

    await strapi.entityService.update('api::concorso-entry.concorso-entry', id, {
      data: {
        nome: entry.nome, cognome: entry.cognome, email: entry.email, telefono: entry.telefono,
        note: entry.note, cartellaSlug: entry.cartellaSlug, statoPagamento: entry.statoPagamento,
        paypalOrderId: entry.paypalOrderId, consensoAccettato: entry.consensoAccettato,
        importo: entry.importo, foto: fotoData,
      },
    });

    await sendConfirmationEmail(entry);

    return ctx.send({ ok: true, foto: fotoData.length });
  },

  async sceglipagamentoManuale(ctx) {
    const { id } = ctx.params;
    const { metodo } = ctx.request.body || {};
    if (!['contanti', 'bonifico'].includes(metodo)) {
      return ctx.badRequest('Metodo non valido');
    }
    const entry = await strapi.db.query('api::concorso-entry.concorso-entry').findOne({ where: { id } });
    if (!entry) return ctx.notFound('Iscrizione non trovata');

    await strapi.db.query('api::concorso-entry.concorso-entry').update({
      where: { id },
      data: { statoPagamento: `in_attesa_${metodo}` },
    });

    return ctx.send({ ok: true });
  },

  async adminLista(ctx) {
    if (!checkAdmin(ctx)) return ctx.unauthorized('Non autorizzato');
    const entries = await strapi.db.query('api::concorso-entry.concorso-entry').findMany({
      populate: ['foto'],
      orderBy: { createdAt: 'desc' },
    });
    return ctx.send({ data: entries });
  },

  async adminSegnaPagato(ctx) {
    if (!checkAdmin(ctx)) return ctx.unauthorized('Non autorizzato');
    const { id } = ctx.params;
    const { metodo } = ctx.request.body || {};
    if (!['contanti', 'bonifico'].includes(metodo)) {
      return ctx.badRequest('Metodo non valido');
    }
    const entry = await strapi.db.query('api::concorso-entry.concorso-entry').findOne({ where: { id } });
    if (!entry) return ctx.notFound('Iscrizione non trovata');

    await strapi.db.query('api::concorso-entry.concorso-entry').update({
      where: { id },
      data: { statoPagamento: `pagato_${metodo}` },
    });

    return ctx.send({ ok: true, entry: { ...entry, statoPagamento: `pagato_${metodo}` } });
  },

  async adminDownloadSingolo(ctx) {
    if (!checkAdmin(ctx)) return ctx.unauthorized('Non autorizzato');
    const { id } = ctx.params;
    const entry = await strapi.db.query('api::concorso-entry.concorso-entry').findOne({ where: { id } });
    if (!entry || !entry.cartellaSlug) return ctx.notFound('Iscrizione non trovata');

    const dir = path.join(UPLOADS_ROOT, entry.cartellaSlug);
    if (!fs.existsSync(dir)) return ctx.notFound('Nessuna foto per questa iscrizione');

    const zipPath = path.join('/tmp', `${entry.cartellaSlug}-${Date.now()}.zip`);
    execSync(`cd "${UPLOADS_ROOT}" && zip -r "${zipPath}" "${entry.cartellaSlug}"`);

    ctx.set('Content-Type', 'application/zip');
    ctx.set('Content-Disposition', `attachment; filename="${entry.cartellaSlug}.zip"`);
    const stream = fs.createReadStream(zipPath);
    stream.on('close', () => fs.unlink(zipPath, () => { }));
    ctx.body = stream;
  },

  async adminDownloadTutto(ctx) {
    if (!checkAdmin(ctx)) return ctx.unauthorized('Non autorizzato');
    if (!fs.existsSync(UPLOADS_ROOT)) return ctx.notFound('Nessuna foto caricata');

    const zipPath = `/tmp/concorso-tutte-foto-${Date.now()}.zip`;
    execSync(`cd "${UPLOADS_ROOT}" && zip -r "${zipPath}" .`);

    ctx.set('Content-Type', 'application/zip');
    ctx.set('Content-Disposition', 'attachment; filename="concorso-tutte-foto.zip"');
    const stream = fs.createReadStream(zipPath);
    stream.on('close', () => fs.unlink(zipPath, () => { }));
    ctx.body = stream;
  },

  async adminCsv(ctx) {
    if (!checkAdmin(ctx)) return ctx.unauthorized('Non autorizzato');
    const entries = await strapi.db.query('api::concorso-entry.concorso-entry').findMany({
      orderBy: { createdAt: 'desc' },
    });

    const header = 'ID,Nome,Cognome,Email,Telefono,Note,StatoPagamento,Data\n';
    const rows = entries.map(e => {
      const esc = (v: string) => `"${(v || '').toString().replace(/"/g, '""')}"`;
      return [e.id, esc(e.nome), esc(e.cognome), esc(e.email), esc(e.telefono), esc(e.note), e.statoPagamento, e.createdAt].join(',');
    }).join('\n');

    ctx.set('Content-Type', 'text/csv');
    ctx.set('Content-Disposition', 'attachment; filename="concorso-partecipanti.csv"');
    ctx.body = header + rows;
  },
}));