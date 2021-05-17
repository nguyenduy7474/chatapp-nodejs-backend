const express = require("express");
const app = express();
const server = require("http").createServer(app);
var io = require("socket.io")(server);
const port = 3000;
var mongoose = require('mongoose');
var md5 = require('md5');
var jwt = require('jsonwebtoken');

//mongoose.connect('mongodb+srv://chatapp:123654789@cluster0.1jwuj.mongodb.net/chatapp?retryWrites=true&w=majority', { useNewUrlParser: true, useFindAndModify: false, useUnifiedTopology: true }); // connect to our database
mongoose.connect('mongodb://127.0.0.1/chatapp', { useNewUrlParser: true, useFindAndModify: false, useUnifiedTopology: true }); // connect to our database
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
    messages: Array,
    lastMessage: Object
});

const userSchema = new mongoose.Schema({
    id: Number,
    username: String,
    password: String,
});

const chatMessage = mongoose.model('chatmessage', chatMessageSchema, 'chatmessage');
const chatPerson = mongoose.model('persons', chatPersonSchema, 'persons');
const User = mongoose.model('user', userSchema, 'user');



function CreateAccessToken(username){
    var token = jwt.sign({
        username: username
    }, 'secret', { expiresIn: "24h" });
    return token
}

function checkToken(token){
    try {
        var decoded = jwt.verify(token, 'secret');
        console.log(decoded)
        return decoded.username
    } catch(err) {
        return false
    }
}

io.on("connection", socket => {
    console.log("a user connected :D");

    socket.on("chat message", obj => {
        chatMessage.find({"id": obj.chatroomid}, (err, found) => {
            if(err) throw err
            console.log(found)
            io.emit("chat message respone", found[0]);
        })
    });

    socket.on("check accesstoken", obj => {
        let username = checkToken(obj.accesstoken)
        if(username){
            io.emit("check accesstoken respone", {"success": true, "username": username})
        }else{
            io.emit("check accesstoken respone", {"success": false})
        }
    })

    socket.on("chat person", obj => {
            let username = obj.username
            chatPerson.find({users: {$elemMatch: {name: username}}}, (err, found) => {
                if(err) throw err
                io.emit("chat person respone", found)
            })
    });

    socket.on("send message", obj => {
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

    socket.on("register user", async (msg) => {
        if(!msg.username || !msg.password || !msg.confirmpassword){
            io.emit("register user respone", {"err": "Hãy nhập hết các trường"});
            return
        }

        if(msg.password != msg.confirmpassword){
            io.emit("register user respone", {"err": "Xác nhận mật khẩu không trùng khớp"});
            return
        }

        let userExist = await User.findOne({username: msg.username})
        if(userExist){
            io.emit("register user respone", {"err": "Username đã có người sử dụng"});
            return
        }else{
            let dataSave = User({
                username: msg.username,
                password: md5(msg.password)
            })

            let result = await dataSave.save()
            io.emit("register user respone", {"success": "Đăng ký thành công"});
        }
    });

    socket.on("login user", async (msg) => {

        var userExist = await User.findOne({username: msg.username, password: md5(msg.password)})
        if(!userExist){
            io.emit("login user respone", {"err": "Sai tài khoản hoặc mật khẩu"});
        }else{
            var token = CreateAccessToken(msg.username)
            io.emit("login user respone", {"success": "Đăng nhập thành công", "token": token});
        }
    })

    socket.on("get user", async (msg) => {
        let regex = new RegExp("^" + msg.username + "$")
        var userExist = await User.find({"username": { $not: regex }})
        if(!userExist){
            io.emit("get user respone", {"err": "Không tìm thấy user"});
        }else{
            io.emit("get user respone", {"success": true, "userExist": userExist});
        }
    })

    socket.on("create new room chat", async (msg) => {
        console.log(msg)
        let username = msg.username
        let currentusername = msg.currentusername
        let checkExist = await chatPerson.find({users: {$elemMatch: {name: currentusername}}})
        for(var i=0; i< checkExist.length; i++){
            for(var j=0; j< checkExist[i].users.length; j++){
                if(checkExist[i].users[j].name == username){
                    io.emit("create new room chat respone", {"success": "Da co san"});
                    return
                }
            }
        }
        let countdoc = await chatPerson.count({})
        const event = new Date();
        let dataroompersons = {
            id: countdoc + 1,
            users: [
                {
                    name: currentusername,
                    imageUri: "http://media.tinthethao.com.vn/files/bongda/2019/06/09/ngay-ra-mat-chelsea-hazard-da-sat-canh-cung-ai-193909jpg.jpg"
                },
                {
                    name: username,
                    imageUri: "http://media.tinthethao.com.vn/files/bongda/2019/06/09/ngay-ra-mat-chelsea-hazard-da-sat-canh-cung-ai-193909jpg.jpg"
                }
            ],
            lastMessage:{
                content: "",
                createdAt: event.toISOString()
            }
        }
        let datapersonsave = chatPerson(dataroompersons)
        await datapersonsave.save()
        let datachatmessage = {
            id: countdoc + 1,
            users: [
                {
                    name: currentusername,
                    imageUri: "http://media.tinthethao.com.vn/files/bongda/2019/06/09/ngay-ra-mat-chelsea-hazard-da-sat-canh-cung-ai-193909jpg.jpg"
                },
                {
                    name: username,
                    imageUri: "http://media.tinthethao.com.vn/files/bongda/2019/06/09/ngay-ra-mat-chelsea-hazard-da-sat-canh-cung-ai-193909jpg.jpg"
                }
            ],
            messages: []
        }
        let datachatmessagesave = chatMessage(datachatmessage)
        await datachatmessagesave.save()
        io.emit("create new room chat respone", {"success": "Tao thanh cong"});
        let found = await chatPerson.find({users: {$elemMatch: {name: username}}})
        io.emit("chat person respone", found)
    })

});

server.listen(port, () => console.log("server running on port:" + port));
