import fs from 'fs';
import path from 'path';

export default {
  '0 * * * *': async ({ strapi }: { strapi: any }) => {
    const HOURS_STANDARD = 48;
    const HOURS_BONIFICO = 168; // 7 giorni

    const cutoffStandard = new Date(Date.now() - HOURS_STANDARD * 60 * 60 * 1000);
    const cutoffBonifico = new Date(Date.now() - HOURS_BONIFICO * 60 * 60 * 1000);

    const staleStandard = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
      filters: {
        statoPagamento: { $in: ['in_attesa', 'in_attesa_contanti'] },
        createdAt: { $lt: cutoffStandard.toISOString() },
      },
    });

    const staleBonifico = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
      filters: {
        statoPagamento: 'in_attesa_bonifico',
        createdAt: { $lt: cutoffBonifico.toISOString() },
      },
    });

    const stale = [...staleStandard, ...staleBonifico];

    for (const entry of stale) {
      if (entry.cartellaSlug) {
        const dir = path.join(process.cwd(), 'public', 'uploads', 'concorso', entry.cartellaSlug);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
      await strapi.entityService.delete('api::concorso-entry.concorso-entry', entry.id);
    }

    if (stale.length > 0) {
      strapi.log.info(`Concorso cleanup: rimosse ${stale.length} iscrizioni non pagate (${staleStandard.length} standard/contanti oltre ${HOURS_STANDARD}h, ${staleBonifico.length} bonifico oltre ${HOURS_BONIFICO}h)`);
    }
  },
};