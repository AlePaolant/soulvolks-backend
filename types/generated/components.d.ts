import type { Schema, Struct } from '@strapi/strapi';

export interface ConcorsoFoto extends Struct.ComponentSchema {
  collectionName: 'components_concorso_fotos';
  info: {
    displayName: 'foto';
    icon: 'landscape';
  };
  attributes: {
    nomeFile: Schema.Attribute.String & Schema.Attribute.Required;
    nomeOriginale: Schema.Attribute.String & Schema.Attribute.Required;
    path: Schema.Attribute.String & Schema.Attribute.Required;
    titolo: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'concorso.foto': ConcorsoFoto;
    }
  }
}
