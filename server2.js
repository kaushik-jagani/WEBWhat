const express = require('express');
const sessionController = require('./controller/sessionController');

const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

const PORT = 3000;

app.post('/api/start-session/:username/:siteName', sessionController.startSession);
app.get('/api/authenticate/:username', sessionController.authenticate);
app.get('/api/apex/:sessionID', sessionController.apex);
app.get('/api/qr-code/:username/:sessionID', sessionController.getQrCode);
app.post('/api/send-message/:username/:sessionID', sessionController.sendMessage);

mongoose.connect('mongodb://127.0.0.1:27017/multiOrganizationDB12')
    .then(() => {
        console.log('Connected to MongoDB');
        // app.listen(PORT, () => {
        //     console.log(`Server is running on port ${PORT}`);
        // });
    })
    .catch(err => {
        console.log('Failed to connect to MongoDB:', err);
        process.exit(1);
    });

    sessionController.initialize(mongoose);

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });