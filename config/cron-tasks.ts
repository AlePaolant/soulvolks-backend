import fs from 'fs';
import path from 'path';

export default {
  '0 * * * *': async ({ strapi }: { strapi: any }) => {
    const HOURS_LIMIT = 48;
    const cutoff = new Date(Date.now() - HOURS_LIMIT * 60 * 60 * 1000);

    const stale = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
      filters: {
        statoPagamento: { $in: ['in_attesa', 'in_attesa_contanti', 'in_attesa_bonifico'] },
        createdAt: { $lt: cutoff.toISOString() },
      },
    });

    for (const entry of stale) {
      if (entry.cartellaSlug) {
        const dir = path.join(process.cwd(), 'public', 'uploads', 'concorso', entry.cartellaSlug);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
      await strapi.entityService.delete('api::concorso-entry.concorso-entry', entry.id);
    }

    if (stale.length > 0) {
      strapi.log.info(`Concorso cleanup: rimosse ${stale.length} iscrizioni non pagate oltre ${HOURS_LIMIT}h`);
    }
  },
};