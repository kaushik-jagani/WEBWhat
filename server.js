const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const qrImage = require('qr-image');
const bodyParser = require('body-parser');
const mime = require('mime-types')
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
const mimeUtils = require('./mimeUtils'); 
const validateUser=require('./validateuser');
const app = express();
const cors = require('cors');
// app.use(express.json());

// Allow CORS for all routes
app.use(cors());
// Middleware to parse URL-encoded bodies


app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

//database schema
const sessionSchema = new mongoose.Schema({
    username: String,
    sessionID: String,
    active: Boolean,
    siteName: String, // Add siteName field to store the site name
    logoutURL: String,
    createdAt: { type: Date, default: Date.now }
});


const Session = mongoose.model('Session', sessionSchema);

let qrImageBuffer = {};
let whatsappClients = {};
let store;

mongoose.connect('mongodb://127.0.0.1:27017/multiOrganizationDB')
    .then(() => {
        store = new MongoStore({ mongoose });
    })
    .catch(err => {
        console.log('Failed to connect to MongoDB:', err);
        process.exit(1);
    });


// Generate a secret key for encryption
const secretKey = 'The coding industry is a dynamic and rapidly evolving field, playing a pivotal role in various sectors. Coding skills are highly sought after, opening up opportunities both within and outside the tech industry¹. The industry encompasses 785445 a wide range of roles, including web developers, software engineers, IT technicians, and data scientists¹. Each role requires proficiency in specific coding languages. For instance, web developer@s often use ipt for front-end development and Python, Java, or 78. The industry is also witnessing a surge in demand for data scientists who leverage programming languages to analyze data and drive business decisions¹. Furthermore, the rise of mobile devices has led to an increased demand for $145$78565 in lang785450.uages like Objective-C and Java². The coding industrys infl#uence extends beyond the tech sector, with its applications found in industries like automotive, cybersecurity, e-commerce, engineering, finance, healthcare, and IT & cloud-based solutions⁴. Thus, the coding industry is not only integral to technological advancement but also instrumental in shaping various other industries';


app.post('/api/start-session/:username/:siteName', async (req, res) => {
    
    const username = req.params.username;
    const siteName = req.params.siteName;
    const logoutURL = req.body.logoutURL;
    
    const validKey = req.headers['validkey'];

    const authetication=validateUser(secretKey);
    console.log("encrypted: " + validKey);
    console.log("url: " + logoutURL);

    // Verify authenticity of request
    if (validKey != authetication) {
        return res.status(401).json({ message: 'Unauthorized ' });
    }
    //genrate sessoin id
    let sessionID = uuidv4();

    const activeSession = await Session.findOne({ username, active: true });
    let existingSession = await Session.findOne({ username, siteName });

    if (existingSession) {
        // If session already exists and is not active, update the session ID
        if (!existingSession.active) {
            return res.status(200).json({ message: 'You have previous created session.', sessionID: existingSession.sessionID });
        } 
    }
     if (activeSession) {
        sessionID = activeSession.sessionID;
        return res.status(200).json({ message: 'You have an active session', sessionID: activeSession.sessionID });
    }
     else {
         // Delete inactive session if exists
         await Session.findOneAndDelete({ username,siteName, active: false });

         //create a new session on database.
        const session = new Session({ username, sessionID, active: false, siteName, logoutURL });
        await session.save();
        whatsappClients[sessionID] = new Client({
            authStrategy: new RemoteAuth({
                clientId: sessionID,
                store,
                backupSyncIntervalMs: 300000,
            }),
        });
    }

    whatsappClients[sessionID].on("ready", () => {
        console.log("client is ready to sent message...");
    })

    whatsappClients[sessionID].on('qr', qr => {
        qrImageBuffer[sessionID] = qrImage.imageSync(qr, { type: 'png' });
        console.log(qrImageBuffer[sessionID]);
    });

    whatsappClients[sessionID].on('authenticated', async (session) => {
        console.log('Authenticated successfully with session:', sessionID);
        try {
            const dbSession = await Session.findOne({ username, sessionID });
            if (dbSession) {
                dbSession.active = true;
                await dbSession.save();
                // res.redirect(`/api/authnticate/${username}`);
            }
        } catch (error) {
            console.log('Error updating session active status:', error);
        }
    });

    whatsappClients[sessionID].on('disconnected', async (reason) => {
        console.log('Client'  + 'sessoin id :' + sessionID + ' disconnected:', reason);
        if (reason === 'session' || reason === 'qr' || reason === 'auth_failure') {
            console.log('Session expired. You need to reauthenticate.');
            whatsappClients[sessionID].initialize().catch(err => {
                console.log('Failed to initialize WhatsApp client:', err);
            });
        }

        // Retrieve the logout URL from the database
        const session = await Session.findOne({ sessionID });
        if (!session) {
            console.log('Session not found in the database');
        }

        const logoutURL = session.logoutURL;
        console.log(logoutURL);
        // Send a GET request to the logout URL
        try {
            await axios.get(logoutURL + `/${sessionID}`);
            console.log('Logout URL sent successfully');
        } catch (error) {
            console.log('Error sending logout URL:',);
        }

    });

    whatsappClients[sessionID].initialize().catch(err => {
        console.log('Failed to initialize WhatsApp client:', err);
    });

    whatsappClients[sessionID].on('error', err => {
        console.error('WhatsApp client error:', err);
    });

    res.status(200).json({ message: 'Session started successfully', sessionID });
});

app.get('/api/authnticate/:username',async(req,res)=>{
    const username = req.params.username;
    try {
        const session = await Session.findOne({ username, active: true });
        if (session) {
            // Session is active
            res.json({ statuscode: 1, message: "Successful authentication" });
        } else {
            // Session is not active
            res.json({ statuscode: 0, message: "Session not active." });
        }
    } catch (error) {
        console.log('Error in /api/authnticate endpoint:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }

    //wait till not ready
    // const username = req.params.username;
    // try {
    //     const session = await Session.findOne({ username, active: true });
    //     if (session) {
    //         // Check if the WhatsApp client is ready
    //         if (whatsappClients[session.sessionID] && whatsappClients[session.sessionID].isReady) {
    //             // WhatsApp client is already ready, send response immediately
    //             res.json({ statuscode: 1, message: "Successful authentication" });
    //         } else {
    //             // WhatsApp client is not ready, wait for it to become ready
    //             await new Promise(resolve => {
    //                 whatsappClients[session.sessionID].once("ready", () => {
    //                     // WhatsApp client is ready, resolve the promise
    //                     resolve();
    //                 });
    //             });
    //             // After the client is ready, send the response
    //             res.json({ statuscode: 1, message: "Successful authentication" });
    //         }
    //     } else {
    //         // Session is not active
    //         res.json({ statuscode: 0, message: "Session not active." });
    //     }
    // } catch (error) {
    //     console.log('Error in /api/authenticate endpoint:', error);
    //     res.status(500).json({ error: 'Internal Server Error' });
    // }
})
app.get('/api/apex/:sessionID',async(req,res)=>{
    const sessionID = req.params.sessionID;
    try {
        // Find the session with the provided session ID and delete it
        const deletedSession = await Session.findOneAndDelete({ sessionID });
        
        if (deletedSession) {
            // Session data successfully deleted
             console.log(`Session data with session ID ${sessionID} deleted successfully` );
        } else {
            // Session with the provided ID not found
            console.log(  `Session data with session ID ${sessionID} not found` );
        }
    } catch (error) {
        // Error occurred during deletion
        console.error('Error deleting session data:', error);
       
    }
    
})

app.get('/api/qr-code/:username/:sessionID', async (req, res) => {
  
    const username = req.params.username;
    const sessionID = req.params.sessionID;
    const validKey = req.headers['validkey'];
  
    const hash = validateUser(secretKey);
    console.log("encrypted: " + validKey);
    

    // Verify authenticity of request

    console.log("decryption : " + hash);
    if (validKey != hash) {
        return res.status(401).json({ message: 'Unauthorized ' });
    }

    const session = await Session.findOne({ username, active: true });
    if (session) {

        return res.status(200).json({ message: 'You already have an active session', sessionID: session.sessionID });
    } else {
        try {
            
            let startTime = Date.now();
            const checkQrCode = () => {
                // Check if QR code is available
                if (qrImageBuffer[sessionID]) {
                    // If QR code is available, send the response immediately
                    const base64String = qrImageBuffer[sessionID].toString('base64');
                    console.log("QR code: " + base64String);
                    return res.status(200).json({ QrBase64: base64String });
                } else {
                    // If QR code is not available
                    const currentTime = Date.now();
                    // Check if 20 seconds have passed
                    if (currentTime - startTime >= 60000) {
                        // If 20 seconds have passed and QR code is still not available, return 404
                        return res.status(404).json({ error: 'QR code not available' });
                    } else {
                        // If less than 20 seconds have passed, wait for a short time and check again
                        setTimeout(checkQrCode, 1000); // Check again after 1 second
                    }
                }
            };
        
            // Start checking for QR code
            checkQrCode();


            //below code is for give base 64 string after 20 sec
            // if (!qrImageBuffer[sessionID]) {
            //     // return res.status(404).json({ error: 'QR code not available' });
            //     setTimeout(() => {
            //         // Check again if qrImageBuffer[sessionID] is still null after 4 seconds
            //         if (!qrImageBuffer[sessionID]) {
            //             return res.status(404).json({ error: 'QR code not available' });
            //         } else {
            //             // If QR code is available after 4 seconds, send the response
            //             const base64String = qrImageBuffer[sessionID].toString('base64');
            //             console.log("qr code : " + base64String);
            //             return res.status(200).json({ QrBase64: base64String });
            //         }
            //     }, 20000); 
            // }
            
            //below code is for give response image
            // if(qrImageBuffer[sessionID]){
            //     const base64String = qrImageBuffer[sessionID].toString('base64');
            //     return res.status(200).json({ QrBase64:base64String });
            // }
            // const base64String = qrImageBuffer[sessionID].toString('base64');
            // console.log("qr code : " +base64String );
            // // return res.status(200).json({ QrBase64:base64String });
            //  res.contentType('image/png').end(qrImageBuffer[sessionID], 'binary');
        } catch (error) {
            console.log('Error sending QR code:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

});

app.post('/api/send-message/:username/:sessionID', async (req, res) => {
    const { username, sessionID } = req.params;
    // const encryptionKey = req.body.encryptionKey;
    const validKey = req.headers['validkey'];
    const hash = validateUser(secretKey);
    // const recipientNumbers = [
    //     '919667700177@c.us',
    //     // '919104884174@c.us',
    //     // '918141001454@c.us',
    //     // '916355357459@c.us',
    //     // '919726551335@c.us',
    //     // Add more numbers here as needed
    // ];

    //fetch data which is coming from body.
    const bodyData = req.body;
    const pdf64Read = bodyData.pdf;
    const recipientList = bodyData.contactList;
    const pdfCaption = bodyData.pdfCaptionMessage

    console.log("pdf : "+" list:"+recipientList+"caption : "+pdfCaption);

     const recipientNumbers = recipientList.split(",").map(number => `${number}@c.us`);
    // Verify authenticity of request
    if (validKey !== hash) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    //previous
    // let filePath = './demo.pdf';
    // const b64data = fs.readFileSync(filePath, { encoding: 'base64' });// Read the PDF file content and encode it as base64

    // var filename = path.basename(filePath);
    // // const mimetype = mime.lookup(filePath);
    // mimetype = mimeUtils.getMimeTypeFromBase64(b64data);
    // const media = new MessageMedia(mimetype, b64data, filename);
    
    
    var filename = 'Test.pdf'; // Update this with your filename

    var mimetype = mimeUtils.getMimeTypeFromBase64(pdf64Read); // Update this with the correct MIME type

     // Now, create the MessageMedia object directly from the received base64 content
    const media = new MessageMedia(mimetype, pdf64Read, filename);

    const session = await Session.findOne({ username, sessionID });
    if (!session) {
        return res.status(404).json({ error: 'Invalid session ID' });
    }
    try {
        for (const recipient of recipientNumbers) {
            ///********************* */
            if(pdf64Read){
            await whatsappClients[sessionID].sendMessage(recipient, media, { caption: pdfCaption, sendMediaAsDocument: true, thumbnailHeight: 480, thumbnailWidth: 339 }).then(() => {
                console.log('Message sent successfully with pdf');

            });
            }else{
                await whatsappClients[sessionID].sendMessage(recipient, 'Hello from WhatsApp!').then(() => {
                    console.log('Message sent successfully');
                    
                })
            }
            console.log(`Message sent successfully to ${recipient}`);

        }
        res.status(200).json({ message: 'Message sent successfully' });
        // whatsappClients[sessionID].sendMessage('919667700177@c.us', "hello from whatsapp.")
        //     .then(() => {
        //         console.log('Message sent successfully');
        //         res.status(200).json({ message: 'Message sent successfully' });
        //     })
        //     .catch(err => {
        //         console.error('Error sending message:', err);
        //         res.status(500).json({ error: 'Error sending message' });
        //     });
    } catch (error) {
        console.log('Error in send-message endpoint:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// '192.168.1.16',
const PORT=3000 || 4200;
app.listen(PORT, () => {
    console.log('Server is running on port 3000');
});
