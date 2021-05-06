const express = require("express");
const app = express();
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const port = 3000;
var mongoose = require('mongoose');
mongoose.connect('mongodb+srv://chatapp:123654789@cluster0.1jwuj.mongodb.net/chatapp?retryWrites=true&w=majority', { useNewUrlParser: true, useFindAndModify: false, useUnifiedTopology: true }); // connect to our database
const db = mongoose.connection;
const chatMessageSchema = new mongoose.Schema({
    id: String,
    users: Array,
    createdAt: String,
    messages: Array
});
const chatPersonSchema = new mongoose.Schema({
    id: Number,
    users: Array,
    messages: Array
});

const chatMessage = mongoose.model('chatmessage', chatMessageSchema, 'chatmessage');
const chatPerson = mongoose.model('persons', chatPersonSchema, 'persons');


io.on("connection", socket => {
    console.log("a user connected :D");

    socket.on("chat message", obj => {
        console.log(obj)
        chatMessage.find({"id": obj.chatroomid}, (err, found) => {
            if(err) throw err
            console.log(found)
            io.emit("chat message respone", found[0]);
        })
    });

    socket.on("chat person", msg => {
        chatPerson.find({}, (err, found) => {
            if(err) throw err
			console.log(found)
            io.emit("chat person respone", found)
        })
    });

    socket.on("send message", obj => {
        console.log(obj)
        chatMessage.findOne({"id": obj.chatroomid}, (err, found) => {
            if(err) throw err
            countmsg = found.messages.length + 1
            stmsg = "m" + countmsg
            const event = new Date();
            var objnewmsg = {
                id: stmsg,
                content: obj.message,
                createdAt: event.toISOString(),
                user: {
                    id: obj.userid,
                    name: obj.username
                }
            }
            found.messages.push(objnewmsg)
            found.save((err) => {
                if(err) throw err
                io.emit("chat message respone", found);
            })
        })
    });


});

server.listen(port, () => console.log("server running on port:" + port));
