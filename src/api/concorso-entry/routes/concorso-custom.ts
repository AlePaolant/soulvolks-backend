export default {
  routes: [
    {
      method: 'POST',
      path: '/concorso/register',
      handler: 'concorso-entry.register',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/concorso/:id/upload',
      handler: 'concorso-entry.uploadFoto',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/concorso/:id/scegli-pagamento-manuale',
      handler: 'concorso-entry.sceglipagamentoManuale',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/concorso/admin/lista',
      handler: 'concorso-entry.adminLista',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/concorso/admin/:id/segna-pagato',
      handler: 'concorso-entry.adminSegnaPagato',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/concorso/admin/:id/download',
      handler: 'concorso-entry.adminDownloadSingolo',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/concorso/admin/download-tutto',
      handler: 'concorso-entry.adminDownloadTutto',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/concorso/admin/csv',
      handler: 'concorso-entry.adminCsv',
      config: { auth: false },
    },
  ],
};