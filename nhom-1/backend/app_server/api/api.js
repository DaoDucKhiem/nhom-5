require('dotenv').config();
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const tokenCheck = require('./token-check');
const userSchema = require('./../model/user.model');
const friendSchema = require('./../model/friend.model');
const notifySchema = require('./../model/notify.model');
const messengerRoom = require('./../model/messenger-room.model');
const genNoti = require('./generate-room-notification');
const messageThread = require('./../model/thread-message.model');

const User = mongoose.model('User', userSchema);
const Friend = mongoose.model('Friend', friendSchema);
const Notify = mongoose.model('Notify', notifySchema);
const MessengerRoom = mongoose.model('MessengerRoom', messengerRoom);
const MessengerThread = mongoose.model('MessengerThread', messageThread);

var storageAvatar = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './../data/avatar/');
    },
    filename: function (req, file, cb) {
        cb(null, req.username);
    }
});

var storagePicture = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './data/picture/');
    },
    filename: function (req, file, cb) {
        cb(null, req.username + '_' + String(Date.now()))
    }
});

var saveAvatarHandlerMiddleware = multer({ storage: storageAvatar });

var savePictureHandlerMiddleware = multer({ storage: storagePicture });

module.exports = function (io) {

    router.get('/createroom', tokenCheck, (req,res)=>{
        let user1 = req.body.username;
        let user2 = req.query.username;

        //check if user is exist ?
        User.findOne({username: user2}, (err,doc)=>{
            if (err) {
                res.json({state:false});
                return;
            }
            if (doc) {
                let thread = new MessengerThread();
                thread.save((err, doc1)=>{
                    if (err) {
                        res.json({
                            state: false
                        });
                        return;
                    }
                    let room = new MessengerRoom();
                    room.authors = [];
                    room.authors.push(user1);
                    room.authors.push(user2);
                    room.thread = doc1._id;
                    room.save((err, doc2)=>{
                        if (err) {
                            res.json({
                                state: false
                            });
                            return;
                        }
                        res.json({
                            state: true,
                            room: doc2
                        });
                    });
                });
            } else {
                res.json({
                    state: true,
                    room: false
                });
            }
        });
    });

    router.get('/get-threadchat', tokenCheck, (req,res)=>{
        threadId = req.query.thread;
        MessengerThread.findById(threadId, (err,doc)=>{
            if (err) {
                res.json({
                    state: false
                });
                return;
            }
            res.json({
                state: true,
                thread: doc
            });
        });
    });

    router.get('/getlistchat', tokenCheck, (req,res)=>{
        let user = req.body.username;
        MessengerRoom.find({authors: user}, 
            (err,docs) => {
                if (err) {
                    res.json({state: false});
                    return;
                }
                res.json({
                    state: true,
                    list: docs
                });
            }
        );

    });


    router.get('/search', (req,res)=>{
        let searchQuery = req.query.q;
        let regex = new RegExp("(.)*"+searchQuery+"(.)*","g");
        User.find(
            {$or:[{username: regex},{name: regex}]},
            (err,docs)=>{
                if (err) {
                    res.json({state:false});
                    return;
                }
                res.json({
                    state:true,
                    results: docs.map(obj=>{
                        return {
                            username: obj.username,
                            name: obj.name,
                            avatarUrl: obj.avatarUrl,
                            gender: obj.gender
                        }
                    })
                });
            }
        );
    });

    router.get('/get-roomchat', tokenCheck, (req,res)=> {
        let roomChatId = req.query.roomid;

        MessengerRoom.findById(roomChatId, (err, doc)=>{
            if (err) {
                res.json({state:false});
            }
            if (doc) {
                res.json({
                    state: true,
                    roomchat: doc
                });
            } else {
                res.json({
                    state: true,
                    roomchat: null
                });
            }
        });
    });
    
    router.get('/rejectfriend', tokenCheck, (req,res)=> {
        let friendId = req.query.username;
        let userId = req.body.username;


        User.findOne({username: friendId},(err,doc)=>{
            if (err) {
                res.json({state:false});
                return;
            }
            if (!doc) {
                res.json({state:false});
            }

            let n = doc.friends.length;
            let isFound = false;
            let pointer = 0;
            for (let i = 0; i < n; i++) {
                if (doc.friends[i].username == userId) {
                    pointer = i;
                    isFound = true;
                    break;
                }
            }
            
            if (isFound) {
                doc.friends.splice(pointer,1);
            } else {
                res.json({state:false});
                return;
            }

            doc.save((err)=>{
                if (err) {
                    res.json({state:false});
                    return;
                }
                if (!doc) {
                    res.json({state:false});
                    return;
                }
                User.findOne({username: userId},(err,doc)=>{
                    if (err) {
                        res.json({state: false});
                        return;
                    }
                    if (!doc) {
                        res.json({state:false});
                        return;
                    }
    
                    let pointer = 0;
                    let isFound = false;
                    let n = doc.friends.length;
                    for (let i = 0; i < n; i++) {
                        if (doc.friends[i].username == friendId) {
                            pointer = i;
                            isFound = true;
                            break;
                        }
                    }
                    if (isFound) {
                        doc.friends.splice(pointer,1);
                    } else {
                        res.json({state:false});
                        return;
                    }
                    n = doc.notifies.length;
                    isFound = false;
                    for (let i = 0; i < n; i++) {
                        if (doc.notifies[i].type == 'friend request') {
                            if (doc.notifies[i].username == friendId) {
                                pointer = i;
                                isFound = true;
                                break;
                            }
                        }
                    }
                    if (isFound) doc.notifies.splice(pointer,1);
        
                    doc.save((err)=>{
                        if (err) {
                            res.json({state: false});
                        } else {
                            res.json({state: true});
                        }
                    });
                });

            });
        });

    });

    router.get('/acceptfriend', tokenCheck, (req,res)=> {
        let friendId = req.query.username;
        let userId = req.body.username;

        //update

        User.findOne({username: friendId},(err,doc)=> {
            if (err) {
                res.json({state:false});
                return;
            }
            if (!doc) {
                res.json({state:false});
                return;
            }

            let notifyData = new Notify({
                type: 'friend accepted',
                payload: {
                    sender: userId
                }
            });

            doc.notifies.unshift(notifyData);
            if (doc.notifies.length > 50) {
                doc.notifies.pop();                
            }

            let n = doc.friends.length;
            for (let i = 0; i < n; i++) {
                if (doc.friends[i].username == userId) {
                    doc.friends[i].relationType = 'friend';
                }
            }

            doc.save((err)=>{
                if (err) {
                    res.json({state:false});
                    return;
                } 
                if (!doc) {
                    res.json({state:false});
                    return;
                }
                io.to(genNoti(friendId)).emit('notify', notifyData);
                User.findOne({username: userId},(err,doc)=>{
                    if (err) {
                        res.json({state: false});
                        return;
                    }
                    if (!doc) {
                        res.json({state:false});
                        return;
                    }
                    let pointer = 0;
                    let n = doc.friends.length;
                    for (let i = 0; i < n; i++) {
                        if (doc.friends[i].username == friendId) {
                            doc.friends[i].relationType = 'friend';
                            break;
                        }
                    }
                    n = doc.notifies.length;
                    let isFound = false;
                    for (let i = 0; i < n; i++) {
                        if (doc.notifies[i].type == 'friend request') {
                            if (doc.notifies[i].payload.sender == friendId) {
                                pointer = i;
                                isFound = true;
                                break;
                            }
                        }
                    }
                    if (isFound) doc.notifies.splice(pointer,1);
        
                    doc.save((err)=>{
                        if (err) {
                            res.json({state: false});
                        } else {
                            res.json({state: true});
                        }
                    });
                });
            });
        });

    });


    router.get('/requestfriend', tokenCheck, (req, res) => {
        let friendId = req.query.username;
        let userId = req.body.username;

        //create notify data
        let notifyData = new Notify({
            type: 'friend request',
            payload: {sender: userId}
        });

        //update in receiver
        let friendTypeInReceiver = new Friend({
            username: userId,
            relationType: 'wait for accept'
        });
        let friendTypeInSender = new Friend({
            username: friendId,
            relationType: 'sent request'
        });

        User.findOne(
            {username: friendId},
            (err,doc) => {

                console.log(err);
                console.log(doc);
                if (err) {
                    res.json({state: false});
                    //run here
                    return;
                }
                if (!doc) {
                    res.json({state: false});
                    return;
                }
                doc.friends.push(friendTypeInReceiver);
                doc.notifies.unshift(notifyData);

                if (doc.notifies.length > 50) {
                    doc.notifies.pop();                
                }
                
                doc.save((err)=>{
                    if (err) {
                        res.json({state:false});
                        return;
                    }
                    if (!doc) {
                        res.json({state:false});
                        return;
                    }
                });

                User.findOne(
                    {username: userId},
                    (err,doc) => {
                        if (err) {
                            res.json({state: false});
                            return;
                        }
                        if (!doc) {
                            res.json({state:false});
                            return;
                        }
                        doc.friends.push(friendTypeInSender);
                        doc.save((err)=>{
                            if (err) {
                                res.json({state:false});
                                return;
                            }
                            if (!doc) {
                                res.json({state:false});
                                return;
                            }
                            res.json({state:true});
                            io.to(genNoti(friendId)).emit('notify', notifyData);
                        });
                    }
                );
            }
        );
    });

    
    router.get('/notify', tokenCheck,(req,res)=> { 
        User.findOne({username: req.body.username}, (err,doc)=>{
            if (err) {
                res.json(
                    {state: false, notifies: false}
                );
            } else {
                if (!doc) {
                    res.json({state: true, notifies: false});
                } else {
                    res.json({
                        state: true,
                        notifies: doc.notifies
                    });
                }
            }
        });
    });

    router.post('/modify-password', tokenCheck, (req,res)=> {
        let newPassword = req.body.password;
        let hashedPassword = bcrypt.hashSync(newPassword,Number(process.env.SALT_ROUND));

        User.findOneAndUpdate({ username: req.body.username }, { password: hashedPassword }, (err, doc) => {
            if (err) {
                res.json({
                    state: false
                });
            } else {
                res.json({
                    state: true
                });
            }
        });

    });

    router.post('/modify', tokenCheck, (req, res) => {
        let newBirthday = req.body.birthday;
        let newGender = req.body.gender;
        let newName = req.body.name;

        User.findOneAndUpdate({ username: req.body.username }, { birthday: newBirthday, gender: newGender, name: newName }, (err, doc) => {
            if (err) {
                res.json({
                    state: false
                });
            } else {
                res.json({
                    state: true
                });
            }
        });
    });


    router.get('/checkfriend', tokenCheck, (req, res) => {
        let friendId = req.query.username;
        let userId = req.body.username;
        User.findOne({ username: userId }, (err, doc) => {
            if (err) {
                res.json({
                    state: false,
                    isFriend: false
                });
            } else {
                if (!doc) {
                    res.json({
                        state: true,
                        isFriend: false
                    });
                } else {
                    let n = doc.friends.length;
                    for (let i = 0; i < n; i++) {
                        if (doc.friends[i].username == friendId) {
                            res.json({
                                state: true,
                                isFriend: doc.friends[i].relationType
                            });
                            return;
                        }
                    }
                    res.json({
                        state: true,
                        isFriend: false
                    });
                    return;
                }
            }
        });
    });

    router.get('/userdetail', tokenCheck, (req, res) => {
        User.findOne({ username: req.body.username }, (err, doc) => {
            if (err) {
                res.json({
                    state: false,
                    user: false
                });
            } else {
                if (!doc) {
                    res.json({
                        state: true,
                        user: false
                    });
                } else {
                    res.json({
                        state: true,
                        user: {
                            username: doc.username,
                            gender: doc.gender,
                            name: doc.name,
                            friends: doc.friends,
                            joinDay: doc.joinDay,
                            avatarUrl: doc.avatarUrl,
                            birthday: doc.birthday,
                            threads: doc.threads
                        }
                    });
                }
            }
        });
    });


    router.get('/user', (req, res) => {
        if (!req.query.username) {
            res.json({
                state: false,
                user: false
            });
        } else {
            let username = req.query.username;
            User.findOne({ username: username }, (err, doc) => {
                if (err) {
                    res.json({
                        state: false,
                        user: false
                    });
                } else {
                    if (!doc) {
                        res.json({
                            state: true,
                            user: false
                        });
                    } else {
                        res.json({
                            state: true,
                            user: {
                                username: doc.username,
                                gender: doc.gender,
                                name: doc.name,
                                avatarUrl: doc.avatarUrl,
                            }
                        });
                    }
                }
            });
        }
    });


    router.post('/avatarupload', tokenCheck, saveAvatarHandlerMiddleware.single('avatar'), (req, res) => {
        User.findOneAndUpdate({ username: req.username }, { avatarUrl: 'assets/data/avatar/' + req.username }, (err, doc) => {
            if (err) res.json({
                state: false
            });
            else res.json({
                state: true
            });
        });
    });


    return router;
}




// module.exports = router;
