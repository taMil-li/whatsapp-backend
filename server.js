const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2/promise');
const cors = require('cors');

require('dotenv').config();
const app = express();
app.use(cors()); 
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", 
        methods: ["GET", "POST"]
    }
});

let db;
try{
    db = mysql.createPool({
    host: process.env.DB_HOST,        
    user: process.env.DB_USER,        
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,    
    port: 3306, 
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
    });
    console.log("DB connected");
} catch(err){
    console.log("DB connection error: ", err);
}

// // Connect Db
// const dbConfig = {
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD, 
//     database: process.env.DB_DATABASE,
//     port: Number(process.env.PORT)
// };

// let db;
// mysql.createConnection(dbConfig)
//     .then(connection => {
//         db = connection;
//         console.log('Successfully connected to MySQL database.');
//     })
//     .catch(error => {
//         console.error('Error connecting with MySQL:', error);
//         process.exit(1);
//     });

// send & receive 

app.get('/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const query = `
            SELECT * FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC
        `;
        const [messages] = await db.execute(query, [user1, user2, user2, user1]);
        res.json(messages);
    } catch (error) {
        console.error('Failed to fetch messages:', error);
        res.status(500).send('Server error');
    }
});



const userSockets = {}; 

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Registration    
    socket.on('register', (userId) => {
        userSockets[userId] = socket.id;
        console.log(`User ${userId} registered with socket ID ${socket.id}`);
        console.log('Current users:', userSockets);
    });

    // Send msg
    socket.on('sendMessage', async (data) => {
        const { senderId, receiverId, content } = data;
        console.log(senderId)

        try {
            const query = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)';
            await db.execute(query, [senderId, receiverId, content]);
        } catch (error) {
            console.error('Failed to save message:', error);
            return; 
        }
        
        // show in chat
        const receiverSocketId = userSockets[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receiveMessage', {
                sender_id: senderId,
                content: content,
                created_at: new Date()
            });
        }
    });

    socket.on('disconnect', () => {
        // disconnect user
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
        console.log('Current users:', userSockets);
    });
});


server.listen(process.env.PORT || 3001, () => console.log(`Server running on ${process.env.PORT}`));