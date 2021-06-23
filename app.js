const express = require("express");
const app = express();
const server = require("http").createServer(app);
var io = require("socket.io")(server);
const port = 3000;
var mongoose = require('mongoose');
var md5 = require('md5');
var jwt = require('jsonwebtoken');
var cron = require('node-cron');
var cloudinary = require('cloudinary').v2;
var RSA = require('hybrid-crypto-js').RSA;
var Crypt = require('hybrid-crypto-js').Crypt;


//mongoose.connect('mongodb+srv://chatapp:123654789@cluster0.1jwuj.mongodb.net/chatapp?retryWrites=true&w=majority', { useNewUrlParser: true, useFindAndModify: false, useUnifiedTopology: true }); // connect to our database
mongoose.connect('mongodb://127.0.0.1/chatapp', { useNewUrlParser: true, useFindAndModify: false, useUnifiedTopology: true }); // connect to our database
const db = mongoose.connection;
const chatMessageSchema = new mongoose.Schema({
    id: String,
    users: Array,
    createdAt: String,
    messages: Array,
    publickey: Object,
    privatekey: Object
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
    avatar: String
});

const chatMessage = mongoose.model('chatmessage', chatMessageSchema, 'chatmessage');
const chatPerson = mongoose.model('persons', chatPersonSchema, 'persons');
const User = mongoose.model('user', userSchema, 'user');


cron.schedule('*/30 * * * *', () => { // quét mỗi 30 phút
    var now = Date.now() - 86400000 // Trừ thêm 24 tiếng
    console.log(now)
    chatMessage.updateMany({}, { $pull: {"messages": {"createdAt": {$lt: now}}}},{multi: true}, ()=>{
        console.log("vua quet thoi han tin nhan")
    })
});


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
    var socketid = socket.id

    socket.on("chat message", obj => {
        socket.join('room' + obj.chatroomid);
        chatMessage.findOne({"id": obj.chatroomid}, (err, found) => {
            if(err) throw err
            console.log(obj)
            io.to('room' + obj.chatroomid).emit("chat message respone", found);
            if(obj.privatekey == false){
                console.log("111")
                found.privatekey = {}
                found.save()
            }
        })
    });

    socket.on("check accesstoken", obj => {
        let username = checkToken(obj.accesstoken)
        if(username){
            io.to(socketid).emit("check accesstoken respone", {"success": true, "username": username})
        }else{
            io.to(socketid).emit("check accesstoken respone", {"success": false})
        }
    })

    socket.on("get data user", obj => {
        let username = checkToken(obj.token)
        User.findOne({username: username}, (err, found) => {
            console.log(found)
            io.to(socketid).emit("get data user respone", {"username": found.username, "avatar": found.avatar})
        })
    })


    socket.on("update avatar", obj => {
        User.updateOne({username: obj.username}, {avatar: obj.avatar}, (err) => {
            if(err) throw err;
            io.to(socketid).emit("update avatar respone", {"username": obj.username, "avatar": obj.avatar})
        })
    })

    socket.on("chat person", obj => {
            let username = obj.username
            chatPerson.find({users: {$elemMatch: {name: username}}}, (err, found) => {
                if(err) throw err
                io.to(socketid).emit("chat person respone", found)
            })
    });

    socket.on("send message", obj => {
        socket.join('room' + obj.chatroomid);
        chatMessage.findOne({"id": obj.chatroomid}, (err, found) => {
            if(err) throw err
            var roomid = obj.chatroomid
            countmsg = found.messages.length + 1
            stmsg = "m" + countmsg
            const event = new Date();
            var objnewmsg = {
                id: stmsg,
                content: obj.message,
                createdAt: parseInt(event.valueOf()),
                user: {
                    name: obj.username
                }
            }
            found.messages.push(objnewmsg)
            found.save((err) => {
                if(err) throw err
                io.to('room' + roomid).emit("chat message respone", found);
            })
        })
    });

    socket.on("register user", async (msg) => {
        if(!msg.username || !msg.password || !msg.confirmpassword){
            io.to(socketid).emit("register user respone", {"err": "Hãy nhập hết các trường"});
            return
        }

        if(msg.password != msg.confirmpassword){
            io.to(socketid).emit("register user respone", {"err": "Xác nhận mật khẩu không trùng khớp"});
            return
        }
        let userExist = await User.findOne({username: msg.username})
        if(userExist){
            io.to(socketid).emit("register user respone", {"err": "Username đã có người sử dụng"});
            return
        }else{
            let dataSave = User({
                username: msg.username,
                password: md5(msg.password),
                avatar: "https://lumiere-a.akamaihd.net/v1/images/pp_ratatouille_herobanner_mobile_19736_4c2e46ac.jpeg"
            })

            let result = await dataSave.save()
            io.to(socketid).emit("register user respone", {"success": "Đăng ký thành công"});
        }
    });

    socket.on("login user", async (msg) => {

        var userExist = await User.findOne({username: msg.username, password: md5(msg.password)})
        if(!userExist){
            io.to(socketid).emit("login user respone", {"err": "Sai tài khoản hoặc mật khẩu"});
        }else{
            var token = CreateAccessToken(msg.username)
            io.to(socketid).emit("login user respone", {"success": "Đăng nhập thành công", "token": token});
        }
    })

    socket.on("get user", async (msg) => {
        let regex = new RegExp("^" + msg.username + "$")
        var userExist = await User.find({"username": { $not: regex }})
        if(!userExist){
            io.to(socketid).emit("get user respone", {"err": "Không tìm thấy user"});
        }else{
            io.to(socketid).emit("get user respone", {"success": true, "userExist": userExist});
        }
    })

    socket.on("create new room chat", async (msg) => {
        console.log(msg)
        let username = msg.username
        let currentusername = msg.currentusername
        let desavatar = msg.desavatar

        let checkExist = await chatPerson.find({users: {$elemMatch: {name: currentusername}}})
        for(var i=0; i< checkExist.length; i++){
            for(var j=0; j< checkExist[i].users.length; j++){
                if(checkExist[i].users[j].name == username){
                    io.to(socketid).emit("create new room chat respone", {"success": "Da co san"});
                    return
                }
            }
        }
        let countdoc = await chatPerson.count({})
        let sourceuser = await User.findOne({username: currentusername})
        const event = new Date();
        let dataroompersons = {
            id: countdoc + 1,
            users: [
                {
                    name: currentusername,
                    imageUri: sourceuser.avatar
                },
                {
                    name: username,
                    imageUri: desavatar
                }
            ],
            lastMessage:{
                content: "",
                createdAt: event.toISOString()
            }
        }
        let datapersonsave = chatPerson(dataroompersons)
        await datapersonsave.save()
        var rsa = new RSA({keySize: 512});
        var crypt = new Crypt({rsaStandard: 'RSAES-PKCS1-V1_5'});
        rsa.generateKeyPair(async function(keyPair) {
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
                messages: [],
                publickey: keyPair.publicKey,
                privatekey: keyPair.privateKey
            }
            console.log("Aa")
            let datachatmessagesave = chatMessage(datachatmessage)
            await datachatmessagesave.save()
            io.to(socketid).emit("create new room chat respone", {"success": datachatmessage});
        })

    })

});

server.listen(port, () => console.log("server running on port:" + port));
