const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AWS Registry API',
      version: '1.0.0',
      description: 'API for AWS Cloud Artifact Registry',
    },
    servers: [
      {
        url: 'http://localhost:8080',
      },
    ],
  },    
  apis: ['./routes/*.js'],
};

module.exports = swaggerJSDoc(options);

