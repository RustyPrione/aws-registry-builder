require('dotenv').config();

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const cors = require("cors");
const path = require("path")
const swaggerSpec = require('./swagger');

const awsRoutes = require('./routes/awsRegistry');
const gitRoutes = require('./routes/gitRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const app = express();
app.use(cors({ origin: "*" }))
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/aws', awsRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/session', sessionRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = 8080;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📄 Swagger: http://localhost:${PORT}/docs`);
});