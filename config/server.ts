import type { Core } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: {
      concorsoCleanup: {
        task: async ({ strapi }: { strapi: any }) => {
          const HOURS_FOTO_MANCANTI = 2;
          const HOURS_STANDARD = 48;
          const HOURS_BONIFICO = 168;

          const cutoffFoto = new Date(Date.now() - HOURS_FOTO_MANCANTI * 60 * 60 * 1000);
          const cutoffStandard = new Date(Date.now() - HOURS_STANDARD * 60 * 60 * 1000);
          const cutoffBonifico = new Date(Date.now() - HOURS_BONIFICO * 60 * 60 * 1000);

          const staleFoto = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
            filters: { statoPagamento: 'foto_mancanti', createdAt: { $lt: cutoffFoto.toISOString() } },
          });
          const staleStandard = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
            filters: { statoPagamento: { $in: ['in_attesa', 'in_attesa_contanti'] }, createdAt: { $lt: cutoffStandard.toISOString() } },
          });
          const staleBonifico = await strapi.entityService.findMany('api::concorso-entry.concorso-entry', {
            filters: { statoPagamento: 'in_attesa_bonifico', createdAt: { $lt: cutoffBonifico.toISOString() } },
          });

          const stale = [...staleFoto, ...staleStandard, ...staleBonifico];

          for (const entry of stale) {
            if (entry.cartellaSlug) {
              const dir = path.join(process.cwd(), 'public', 'uploads', 'concorso', entry.cartellaSlug);
              if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            }
            await strapi.entityService.delete('api::concorso-entry.concorso-entry', entry.id);
          }

          strapi.log.info(`Concorso cleanup: controllo eseguito, rimosse ${stale.length} iscrizioni (${staleFoto.length} senza foto)`);
        },
        options: {
          rule: '*/15 * * * *',
        },
      },
    },
  },
});
export default config;