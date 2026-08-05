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
  ],
};
