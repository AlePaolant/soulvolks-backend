export default {
  routes: [
    {
      method: 'POST',
      path: '/concorso/register',
      handler: 'concorso-entry.register',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/concorso/:id/upload',
      handler: 'concorso-entry.uploadFoto',
      config: {
        auth: false,
      },
    },
  ],
};