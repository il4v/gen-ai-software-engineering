const express = require('express');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');
const ticketRoutes = require('./routes/tickets');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve UI
app.use(express.static(path.join(__dirname, '../ui')));

app.use('/tickets', ticketRoutes);

app.use(errorHandler);

module.exports = app;
