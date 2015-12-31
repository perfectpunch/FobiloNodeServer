var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server, { log: false }),
	dateformat = require('dateformat'),
	mysql = require('mysql'),
	md5 = require('md5'),
	fs = require('fs'),
	validator = require('validator'),
	nodemailer = require('nodemailer'),
	users = {},
	characters = "ABCDEFGHIJKLMNOPRSTUVYZ1234567890",
	host = 'localhost',
	user = 'root',
	pw = '',
	database = 'fobilo',
	hostAddress = 'http://www.google.com.tr',
	hostMail = "perfect.punch1@gmail.com",
	hostMailPassword = "sananelanmal",
	mailService = "Gmail";
	listenport = 3000;
	
server.listen(listenport);
console.log("Server " + listenport + " portunda başlatıldı...");
app.get('/', function(req, res){
	res.sendfile(__dirname + '/index.html');
});

app.use("/", express.static(__dirname));

/////////KAYIT OL////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/signup', function(req, res){
	var username = req.query.username,
		mail = req.query.mail,
		password = req.query.password,
		lang = req.query.lang;

	if(lang == null) {
		res.send("lang-null");
	}
	else if(lang.length < 0) {
		res.send("lang-null");
	}
	else if(username == null) {
		res.send("username-null");
	}
	else if(username.length < 3 || username.length >20) {
		res.send("username-length-error");
	}
	else if(username.indexOf(" ") > -1) {
		res.send("username-has-spaces");
	}
	else {
		checkUsername(username, function(cb){
			if(cb == "1") {
				res.send("username-already-exists");
			}
			else if(cb == "0") {
				if (mail == null) {
					res.send("mail-null");
				}
				else if(!validator.isEmail(mail)) {
					res.send("email-invalid");
				}
				else {
					checkEmail(mail, function(cb){
						if (cb == "1") {
							res.send("email-already-exists");
						}
						else if (cb == "0") {
							var specialChars = "<>@!#$%^&*()_+[]{}?:;|'\"\\,./~`-=";
							var check = function(string){
								for(i = 0; i < specialChars.length;i++){
									if(string.indexOf(specialChars[i]) > -1){
									   return true
									}
								}
								return false;
							}
							if (password == null) {
								res.send("password-null");
							}
							else if(password.length<6 || password.length>12) {
								res.send("password-length-error");
							}
							else if(check(password) == true) {
								res.send("password-has-special-characters");
							}
							else if(password.indexOf(" ") > -1) {
								res.send("password-has-spaces");
							}
							else {
								var date = dateformat(new Date(), "dd.mm.yyyy");
								var connection = mysql.createConnection({
									host     : host,
									user     : user,
									password : pw,
									database : database
								});
								
								connection.connect(function(err){
									if(err) {
										res.send("-1"); //Database hatası
									}
								});
								
								connection.query("INSERT INTO tbl_users(username, e_mail, password, biography, signup_date, secret) values('" + username + "', '" + mail + "', '" + md5(password) + "', '', '" + date + "', '0')", function(err, rows, fields) {
									if(err){
										res.send("-2"); //Query hatası
									}
									else {
										function random (low, high) {
											return Math.floor(Math.random() * (high - low) + low);
										}
										
										var code = "";
										
										for (var i = 0; i < 5; i++)
										{
											code += characters[random(0, characters.length-1)];
										}
										
										getUserID(username, function(callb) {
											if(parseInt(callb) > 0) {
												createCodeAndSendMail(callb, username, mail, lang, function(clbck) {
													if(clbck == "1") {
														console.log(username + " kayıt oldu.");
														res.send("successfully-signup");
													}
													else {
														res.send("error");
													}
												});
											}
											else {
												res.send("error");
											}
										});
									}
								});
								connection.end();
							}
						}
						else {
							res.send("error");
						}
					});
				}
			}
			else {
				res.send("error");
			}
		});
	}
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function sendHeartbeat(){
    setTimeout(sendHeartbeat, 8000);
    io.sockets.emit('ping', { beat : 1 });
}

io.sockets.on('connection', function(socket){
	socket.isLoggedIn = false;
	
/////////GİRİŞ YAP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('new user', function(username, password, callback){
		if(password != null && password != "null" && password.length > 0 && username != null && username != "null" && username.length > 0){
			var connection = mysql.createConnection({
				host     : host,
				user     : user,
				password : pw,
				database : database
			});

			connection.connect(function(err){
				if(err) {
					callback({status: "database-error"});
				}
			});
			
			connection.query("SELECT u.user_id, u.username, u.e_mail, u.biography, u.signup_date, u.secret, (SELECT IF(COUNT(cm.user_id)>0, '0', '1') FROM tbl_confirm_mail cm WHERE cm.user_id=u.user_id) as mail_confirm_status FROM tbl_users u WHERE BINARY (u.username = '" + username + "' OR BINARY u.e_mail = '" + username + "') AND BINARY u.password = '" + md5(password) + "'", function(err, rows, fields) {
				if(err){
					callback({status: "query-error"});
				}
				else{
					if (rows.length > 0) {
						if (rows[0].user_id in users){
							users[rows[0].user_id].emit('another-login', {alert: 'another-login'});
							users[rows[0].user_id].disconnect();
							delete users[rows[0].user_id];
						}
						socket.user_id = rows[0].user_id;
						users[socket.user_id] = socket;
						socket.userName = username;
						socket.mail = rows[0].e_mail;
						socket.password = md5(password);
						updateNicknames();
						socket.isLoggedIn = true;
						callback({status: "success", user_id: rows[0].user_id, username: rows[0].username, e_mail: rows[0].e_mail, biography: rows[0].biography, signup_date: rows[0].signup_date, secret: rows[0].secret, mail_confirm_status: rows[0].mail_confirm_status });
						console.log(socket.userName + " bağlandı.");
					}
					else {
						callback({status: "username-password-not-match"});
					}
				}
			});
			connection.end();
		}
	});
	
/////////BEĞENİ//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////	
	
	socket.on('new-like', function(to, photoName, callback){
		if(to != null && to != "null" && to.length > 0 && photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			checkVisibility(socket.user_id, to, function(cal){
				if(cal == "1") {
					checkPhoto(to, photoName, function(call){
						if(call == "1") {
							checkLike(socket.user_id, photoName, function(cb){
								if(cb == "0"){
									var connection = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
									
									connection.connect(function(err){
										if(err) {
											return callback("-1"); //Database hatası
										}
									});
									
									connection.query("INSERT INTO tbl_likes(user_id, photo_name, like_date) values('" + socket.user_id + "', '" + photoName + "', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "')", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											if(socket.user_id != to) {
												var conn = mysql.createConnection({
													host     : host,
													user     : user,
													password : pw,
													database : database
												});
												
												conn.connect(function(err){
													if(err) {
														return callback("-1"); //Database hatası
													}
												});
												
												conn.query("INSERT INTO tbl_notifications(user_id, whose, photo_name, notification_type, notification_date, seen) values('" + socket.user_id + "', '" + to + "', '" + photoName + "', 'like', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "', '0')", function(err, rows, fields) {
													if(err){
														callback("-2"); //Query hatası
													}
													else {
														if (to in users){
															users[to].emit('like', {user_id: socket.user_id, username : socket.userName, photo_name: photoName});
														}
													}
												});
											}
											callback("success");
										}
									});
									connection.end();
								}
								else {
									callback("already-liked");
								}
							});
						}
					});
				}
				else {
					callback("you-cannot-like-this-photo");
				}
			});
		}
	});
	
/////////BEĞENİYİ GERİ AL////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('new-dislike', function(to, photoName, callback){
		if(to != null && to != "null" && to.length > 0 && photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			checkPhoto(to, photoName, function(call){
				if(call == "1") {
					checkLike(socket.user_id, photoName, function(cb){
						if(cb == "1"){
							var connection = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
									
							connection.connect(function(err){
								if(err) {
									return callback("-1"); //Database hatası
								}
							});
									
							connection.query("DELETE FROM tbl_likes WHERE user_id = '" + socket.user_id + "' AND photo_name = '" + photoName + "'", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else {
									if(socket.user_id != to) {
										checkNotification(socket.user_id, to, photoName, function(c) {
											if(c == "1") {
												var conn = mysql.createConnection({
													host     : host,
													user     : user,
													password : pw,
													database : database
												});
														
												conn.connect(function(err){
													if(err) {
														return callback("-1"); //Database hatası
													}
												});
												
												conn.query("DELETE FROM tbl_notifications WHERE user_id = '" + socket.user_id + "' AND whose = '" + to + "' AND photo_name = '" + photoName + "' AND notification_type = 'like'", function(err, rows, fields) {
													if(err){
														callback("-2"); //Query hatası
													}
												});
											}
										});
									}
									callback("success");
								}
							});
									connection.end();
						}
						else {
							callback("already-disliked");
						}
					});
				}
			});
		}
	});
	
/////////TAKİP ET////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('new-follow', function(to, callback){
		if(to != null && to != "null" && to.length > 0 && socket.isLoggedIn){
			checkUser(socket.user_id, function(cb){
				if(cb == "1"){
					getIsFollowedUser(socket.user_id, to, function(cal){
						if(cal == "-1"){
							callback("cannot-follow-yourself"); //Kendini takip edemez
						}
						else if(cal == "0"){
							getIsProfileSecret(to, function(call){
								if(call == "1") {
									var conn = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
														
									conn.connect(function(err){
										if(err) {
											callback("-1"); //Database hatası
										}
									});
														
									conn.query("INSERT INTO tbl_follow_requests(user_id, followed_id, follow_date) values('" + socket.user_id + "', '" + to + "', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "')", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											if (to in users){
												users[to].emit('follow-request', {user_id: socket.user_id, username : socket.userName});
											}
											callback("follow-request-sent");
										}
									});
								}
								else if(call == "0"){
									var conn = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
														
									conn.connect(function(err){
										if(err) {
											callback("-1"); //Database hatası
										}
									});
														
									conn.query("INSERT INTO tbl_followed_lists(user_id, followed_id, follow_date) values('" + socket.user_id + "', '" + to + "', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "')", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											var conn = mysql.createConnection({
												host     : host,
												user     : user,
												password : pw,
												database : database
											});
																
											conn.connect(function(err){
												if(err) {
													callback("-1"); //Database hatası
												}
											});
																
											conn.query("INSERT INTO tbl_notifications(user_id, whose, photo_name, notification_type, notification_date, seen) values('" + socket.user_id + "', '" + to + "', '', 'follow', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "', '0')", function(err, rows, fields) {
												if(err){
													callback("-2"); //Query hatası
												}
												else {
													if (to in users){
														users[to].emit('follow', {user_id: socket.user_id, username : socket.userName});
													}
													callback("successfully-followed");
												}
											});
										}
									});
								}
								else {
									callback("error"); //Hata
								}
							});
						}
						else if(cal == "1"){
							callback("already-followed"); //Görüntülenebilir
						}
						else if(cal == "2"){
							callback("already-sent-follow-request"); //Takip isteği zaten gönderilmiş
						}
						else {
							callback("error"); //Hata
						}
					});
				}
				else {
					callback("user-cannot-found");
				}
			});
		}
	});
	
/////////TAKİP ETMEYİ BIRAK//////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('stop-following', function(to, callback){
		if(to != null && to != "null" && to.length > 0 && socket.isLoggedIn){
			getIsFollowedUser(socket.user_id, to, function(cal){
				if(cal == "1"){
					var conn = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
														
					conn.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
												
					conn.query("DELETE FROM tbl_followed_lists WHERE user_id = '" + socket.user_id + "' AND followed_id = '" + to + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else {
							var conn = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
																
							conn.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
														
							conn.query("DELETE FROM tbl_notifications WHERE (user_id = '" + to + "' AND whose = '" + socket.user_id + "' AND notification_type = 'follow_request_accepted') OR (user_id = '" + socket.user_id + "' AND whose = '" + to + "' AND notification_type = 'follow')", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else {
									var conn = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
																		
									conn.connect(function(err){
										if(err) {
											callback("-1"); //Database hatası
										}
									});
																
									conn.query("DELETE FROM tbl_follow_requests WHERE user_id = '" + socket.user_id + "' AND followed_id = '" + to + "'", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											callback("successfully-removed");
										}
									});
								}
							});
						}
					});
				}
				else if(cal == "2" || cal == "0" || cal == "-1"){
					callback("already-not-follow"); //Zaten takip edilmiyor
				}
				else {
					callback("error"); //Hata
				}
			});
		}
	});
	
/////////TAKİP İSTEĞİNİ GERİ AL//////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('cancel-follow-request', function(to, callback){
		if(to != null && to != "null" && to.length > 0 && socket.isLoggedIn){
			getIsFollowedUser(socket.user_id, to, function(cal){
				if(cal == "2"){
					var conn = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
														
					conn.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
												
					conn.query("DELETE FROM tbl_follow_requests WHERE user_id = '" + socket.user_id + "' AND followed_id = '" + to + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else {
							callback("successfully-cancelled");
						}
					});
				}
				else if(cal == "0"){
					callback("not-sent-follow-request"); //Zaten takip isteği gönderilmemiş
				}
				else if(cal == "1"){
					callback("already-followed"); //Zaten takip ediliyor
				}
				else {
					callback("error"); //Hata
				}
			});
		}
	});
	
/////////TAKİP İSTEĞİNİ YOKSAY///////////////////////////////////////////////////////////////////////////////////////////////////////

	socket.on('ignore-follow-request', function(to, callback){
		if(to != null && to != "null" && to.length > 0 && socket.isLoggedIn){
			getIsFollowedUser(to, socket.user_id, function(cal){
				if(cal == "2"){
					var conn = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
					
					conn.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
					
					conn.query("DELETE FROM tbl_follow_requests WHERE user_id = '" + to + "' AND followed_id = '" + socket.user_id + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else {
							callback("successfully-ignored");
						}
					});
				}
				else if(cal == "0"){
					callback("follow-request-not-found"); //Takip isteği bulunamadı
				}
				else if(cal == "1"){
					callback("already-followed-you"); //Zaten takip edenler arasında
				}
				else {
					callback("error"); //Hata
				}
			});
		}
	});
	
/////////TAKİP İSTEĞİNİ ONAYLA///////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('accept-request', function(to, callback){
		if(to != null && to != "null" && to.length > 0 && socket.isLoggedIn){
			getIsFollowedUser(to, socket.user_id, function(cal){
				if(cal == "2"){
					var conn = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
					
					conn.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
					
					conn.query("UPDATE tbl_follow_requests SET status = '1' WHERE user_id = '" + to + "' AND followed_id = '" + socket.user_id + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else {
							var conn = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
							
							conn.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
							
							conn.query("INSERT INTO tbl_followed_lists(user_id, followed_id, follow_date) values('" + to + "', '" + socket.user_id + "', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "')", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else {
									var conn = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
									
									conn.connect(function(err){
										if(err) {
											callback("-1"); //Database hatası
										}
									});
									
									conn.query("INSERT INTO tbl_notifications(user_id, whose, photo_name, notification_type, notification_date, seen) values('" + socket.user_id + "', '" + to + "', '', 'follow_request_accepted', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "', '0')", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											if (to in users){
												users[to].emit('follow-request-accepted', {user_id: socket.user_id, username : socket.userName});
											}
											callback("successfully-accepted");
										}
									});
								}
							});
						}
					});
				}
				else if(cal == "0"){
					callback("follow-request-not-found"); //Takip isteği bulunamadı
				}
				else if(cal == "1"){
					callback("already-followed-you"); //Zaten takip edenler arasında
				}
				else {
					callback("error"); //Hata
				}
			});
		}
	});
	
/////////YORUM YAZ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('new-comment', function(photoName, comment, callback){
		if(comment != null && comment != "null" && comment.length > 0 && photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			getPhotoOwner(photoName, function(c){
				if(c <= 0) {
					callback("error");
				}
				else {
					to = c;
					checkVisibility(socket.user_id, to, function(cal){
						if(cal == "1") {
							checkPhoto(to, photoName, function(call){
								if(call == "1") {
									var connection = mysql.createConnection({
										host     : host,
										user     : user,
										password : pw,
										database : database
									});
											
									connection.connect(function(err){
										if(err) {
											callback("-1"); //Database hatası
										}
									});
									
									connection.query("INSERT INTO tbl_comments(user_id, photo_name, comment, date) values('" + socket.user_id + "', '" + photoName + "', '" + comment + "', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "')", function(err, rows, fields) {
										if(err){
											callback("-2"); //Query hatası
										}
										else {
											if(socket.user_id != to) {
												var conn = mysql.createConnection({
													host     : host,
													user     : user,
													password : pw,
													database : database
												});
												
												conn.connect(function(err){
													if(err) {
														return callback("-1"); //Database hatası
													}
												});
												
												conn.query("INSERT INTO tbl_notifications(user_id, whose, photo_name, notification_type, notification_date, seen) values('" + socket.user_id + "', '" + to + "', '" + photoName + "', 'comment', '" + dateformat(new Date(), "dd.mm.yyyy HH:MM") + "', '0')", function(err, rows, fields) {
													if(err){
														callback("-2"); //Query hatası
													}
													else {
														if (to in users){
															users[to].emit('comment', {user_id: socket.user_id, username : socket.userName, photo_name: photoName, comment: comment});
														}
													}
												});
											}
											callback("success");
										}
									});
									connection.end();
								}
								else {
									callback("photo-not-found");
								}
							});
						}
						else {
							callback("you-cannot-write-comment-this-photo");
						}
					});
				}
			});
		}
	});
	
/////////BİLDİRİMLERİ GETİR//////////////////////////////////////////////////////////////////////////////////////////////////////////

	socket.on('get-notifications', function(callback){
		if(socket.isLoggedIn){
			
			getNotifications(function(call){
				var other_notifications = [];
				if(call == "-1" || call == "-2" || call == "0"){
					other_notifications = [];
				}
				else {
					other_notifications = call;
				}
				
				getFollowRequests(function(cb){
					var follow_requests = [];
					
					if(cb == "-1" || cb == "-2" || cb == "0") {
						follow_requests = [];
					}
					else {
						follow_requests = cb;
					}
					
					var notifications = [];
					notifications.push(
						{
							follow_requests : follow_requests,
							notifications : other_notifications
						}
					);
					callback(notifications);
					
				});
			});
		}
	});

/////////YORUMLARI GETİR/////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-comments', function(photoName, callback){
		if(photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			getPhotoOwner(photoName, function(c){
				if(c <= 0) {
					callback("error");
				}
				else {
					to = c;
					checkVisibility(socket.user_id, to, function(cal){
						if(cal == "1") {							
							var connection = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
							
							connection.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
							
							connection.query("SELECT tbl_comments.id, tbl_comments.user_id, tbl_users.username, tbl_comments.comment, (IF('" + socket.user_id + "' = tbl_users.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id))) as is_followed FROM tbl_comments INNER JOIN tbl_users ON tbl_users.user_id=tbl_comments.user_id WHERE tbl_comments.photo_name='" + photoName + "' AND tbl_comments.visibility='1'", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else{
									var comments_array = [];
									if (rows.length > 0) {
										for(var i = 0; i < rows.length; i++) {
											
											comments_array.push(
												{
													comment_id : rows[i].id,
													user_id : rows[i].user_id,
													username : rows[i].username,
													comment : rows[i].comment,
													is_followed : rows[i].is_followed
												}
											);
											
										}
										callback(comments_array);
									}
									else {
										comments_array = []
										callback(comments_array); //Yorum yok
									}
								}
							});
							connection.end();	
						}
						else {
							callback("you-cannot-access-this-drawing");
						}
					});
				}
			});
		}
	});
	
/////////BEĞENİLERİ GETİR////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-likes', function(photoName, callback){
		if(photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			getPhotoOwner(photoName, function(c){
				if(c <= 0) {
					callback("error");
				}
				else {
					to = c;
					checkVisibility(socket.user_id, to, function(cal){
						if(cal == "1") {							
							var connection = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
							
							connection.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
							
							connection.query("SELECT tbl_likes.user_id, tbl_users.username AS owner_username, (SELECT IF(user_id = tbl_likes.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_likes.user_id)) FROM tbl_followed_lists WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_likes.user_id)) FROM tbl_users WHERE username='" + socket.userName + "') as is_followed FROM tbl_likes INNER JOIN tbl_users ON tbl_users.user_id=tbl_likes.user_id WHERE tbl_likes.photo_name='" + photoName + "'", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else{
									var likes_array = [];
									if (rows.length > 0) {
										for(var i = 0; i < rows.length; i++) {
											
											likes_array.push(
												{
													user_id : rows[i].user_id,
													username : rows[i].owner_username,
													is_followed : rows[i].is_followed
												}
											);
											
										}
										callback(likes_array);
									}
									else {
										likes_array = []
										callback(likes_array); //Bildirim yok
									}
								}
							});
							connection.end();	
						}
						else {
							callback("you-cannot-access");
						}
					});
				}
			});
		}
	});
	
/////////TAKİPÇİLERİ GETİR///////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-follower-list', function(userID, callback){
		if(userID != null && userID != "null" && userID.length > 0 && socket.isLoggedIn){
			checkVisibility(socket.user_id, userID, function(cal){
				if(cal == "1") {							
					var connection = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
					
					connection.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
					
					connection.query("SELECT tbl_followed_lists.user_id, tbl_users.username AS owner_username, (SELECT IF(user_id = tbl_followed_lists.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_followed_lists.user_id)) FROM tbl_followed_lists WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_followed_lists.user_id)) FROM tbl_users WHERE username='" + socket.userName + "') as is_followed FROM tbl_followed_lists INNER JOIN tbl_users ON tbl_users.user_id=tbl_followed_lists.user_id WHERE tbl_followed_lists.followed_id='" + userID + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else{
							var followers_array = [];
							if (rows.length > 0) {
								for(var i = 0; i < rows.length; i++) {
									
									followers_array.push(
										{
											user_id : rows[i].user_id,
											username : rows[i].owner_username,
											is_followed : rows[i].is_followed
										}
									);
									
								}
								callback(followers_array);
							}
							else {
								followers_array = []
								callback(followers_array); //Takipçi yok
							}
						}
					});
					connection.end();	
				}
				else {
					callback("you-cannot-access");
				}
			});
		}
	});
	
/////////TAKİP EDİLENLERİ GETİR//////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-following-list', function(userID, callback){
		if(userID != null && userID != "null" && userID.length > 0 && socket.isLoggedIn){
			checkVisibility(socket.user_id, userID, function(cal){
				if(cal == "1") {							
					var connection = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
					
					connection.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
					
					connection.query("SELECT tbl_followed_lists.followed_id, tbl_users.username AS owner_username, (SELECT IF(user_id = tbl_followed_lists.followed_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_followed_lists.user_id)) FROM tbl_followed_lists WHERE user_id='" +  socket.user_id + "' AND followed_id=tbl_followed_lists.followed_id)) FROM tbl_users WHERE username='" + socket.userName + "') as is_followed FROM tbl_followed_lists INNER JOIN tbl_users ON tbl_users.user_id=tbl_followed_lists.followed_id WHERE tbl_followed_lists.user_id='" + userID + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else{
							var followings_array = [];
							if (rows.length > 0) {
								for(var i = 0; i < rows.length; i++) {
									
									followings_array.push(
										{
											user_id : rows[i].followed_id,
											username : rows[i].owner_username,
											is_followed : rows[i].is_followed
										}
									);
									
								}
								callback(followings_array);
							}
							else {
								followings_array = []
								callback(followings_array); //Takip edilen yok
							}
						}
					});
					connection.end();	
				}
				else {
					callback("you-cannot-access");
				}
			});
		}
	});
	
/////////ÇİZİM BİLGİLERİNİ GETİR/////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-drawing-info', function(photoName, callback){
		if(photoName != null && photoName != "null" && photoName.length > 0 && socket.isLoggedIn){
			getPhotoOwner(photoName, function(c){
				if(c <= 0) {
					callback("error");
				}
				else {
					to = c;
					checkVisibility(socket.user_id, to, function(cal){
						if(cal == "1") {							
							var connection = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
							
							connection.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
							
							connection.query("SELECT tbl_shared.user_id, tbl_users.username, tbl_shared.date, tbl_shared.content, (SELECT COUNT(*) FROM tbl_comments WHERE photo_name = tbl_shared.photo_name) AS comment_count, (SELECT COUNT(*) FROM tbl_likes WHERE photo_name = tbl_shared.photo_name) AS like_count, (SELECT IF(user_id = tbl_shared.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_shared.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_shared.user_id)) FROM tbl_users WHERE username='" + socket.userName + "') as is_followed, (SELECT IF(COUNT(*)>0, '1', '0') FROM tbl_likes WHERE photo_name='" + photoName + "' AND user_id='" + socket.user_id + "') AS is_liked FROM tbl_shared INNER JOIN tbl_users ON tbl_users.user_id=tbl_shared.user_id WHERE tbl_shared.photo_name='" + photoName + "'", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else{
									if (rows.length > 0) {
										callback({ user_id: rows[0].user_id, username: rows[0].username, date: rows[0].date, content: rows[0].content, like_count: rows[0].like_count, comment_count: rows[0].comment_count, is_followed: rows[0].is_followed, is_liked: rows[0].is_liked });
									}
									else {
										callback("drawing-not-found"); //Çizim yok
									}
								}
							});
							connection.end();
						}
						else {
							callback("you-cannot-access-this-drawing");
						}
					});
				}
			});
		}
	});
	
/////////KULLANICI BİLGİLERİNİ GETİR/////////////////////////////////////////////////////////////////////////////////////////////////

	socket.on('get-user-info', function(usr, callback){
		if(usr != null && usr != "null" && usr.length > 0 && socket.isLoggedIn){
			var connection = mysql.createConnection({
				host     : host,
				user     : user,
				password : pw,
				database : database
			});
							
			connection.connect(function(err){
				if(err) {
					callback("-1"); //Database hatası
				}
			});
			connection.query("SELECT user_id, username, e_mail, (SELECT COUNT(*) FROM tbl_followed_lists WHERE followed_id=tbl_users.user_id) AS followers_count, (SELECT COUNT(*) FROM tbl_followed_lists WHERE user_id=tbl_users.user_id) AS following_count, biography, signup_date, secret, (SELECT COUNT(*) FROM tbl_shared WHERE user_id = tbl_users.user_id) AS drawing_count, (SELECT IF(COUNT(*)>0, '1', '0') FROM tbl_follow_requests WHERE user_id = tbl_users.user_id AND followed_id = '" + socket.user_id + "' AND status = '0') AS follow_request, (IF('" + socket.user_id + "' = tbl_users.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id))) as is_followed FROM tbl_users WHERE tbl_users.username='" + usr + "'", function(err, rows, fields) {
				if(err){
					callback("-2"); //Query hatası
				}
				else{
					if (rows.length > 0) {
						
						getSharedDrawings(rows[0].user_id, function(cb){
							var drawings = [];
							var secret = rows[0].secret;
							var is_followed = rows[0].is_followed;
							
							if(cb == "-1" || cb == "-2" || cb == "0") {
								drawings = [];
							}
							else {
								if((secret == "1" && is_followed == "1") || secret == "0") {
									drawings = cb;
								}
								else {
									drawings = [];
								}
							}
							
							callback(
								{ 
									user_id: rows[0].user_id,
									username: rows[0].username,
									e_mail: rows[0].e_mail,
									followers_count: rows[0].followers_count,
									following_count: rows[0].following_count,
									drawing_count: rows[0].drawing_count,
									biography: rows[0].biography,
									signup_date: rows[0].signup_date,
									shared_photos: drawings,
									secret: secret,
									is_followed: is_followed,
									follow_request: rows[0].follow_request
								}
							);
							
						});
					}
					else {
						callback("user-not-found"); //Kullanıcı yok
					}
				}
			});
			connection.end();
		}
	});
	
/////////ARAMA SONUÇLARINI GETİR/////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('get-search-results', function(text, callback){
		if(text != null && text != "null" && text.length > 0 && socket.isLoggedIn){
			var connection = mysql.createConnection({
				host     : host,
				user     : user,
				password : pw,
				database : database
			});
							
			connection.connect(function(err){
				if(err) {
					callback("-1"); //Database hatası
				}
			});
			
			connection.query("SELECT user_id, username, (SELECT COUNT(*) FROM tbl_shared WHERE user_id = tbl_users.user_id) AS drawing_count, (SELECT IF(COUNT(*)>0, '1', '0') FROM tbl_follow_requests WHERE user_id = tbl_users.user_id AND followed_id = '" + socket.user_id + "' AND status = '0') AS follow_request, (IF('" + socket.user_id + "' = tbl_users.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id))) as is_followed FROM tbl_users WHERE username LIKE '" + text + "%' AND username != '" + socket.userName + "'", function(err, rows, fields) {
				if(err){
					callback("-2"); //Query hatası
				}
				else{
					var results_array = [];
					if (rows.length > 0) {
						for(var i = 0; i < rows.length; i++) {
							
							results_array.push(
								{
									user_id : rows[i].user_id,
									username : rows[i].username,
									is_followed : rows[i].is_followed
								}
							);
							
						}
						callback(results_array);
					}
					else {
						results_array = []
						callback(results_array); //Arama sonucu boş
					}
				}
			});
			connection.end();
		}
	});
	
/////////ÇİZİM PAYLAŞ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('share-drawing', function(image_base64_str, content, callback){
		if(image_base64_str != null && image_base64_str != "null" && image_base64_str.length > 0 && (content != null && (content == "" || content.length > 0)) && socket.isLoggedIn){
				
			try{
				var date = dateformat(new Date(), "dd.mm.yyyy HH:MM");
				var photo_name = dateformat(new Date(), "ddmmyyyyHHMMss") + socket.user_id + ".jpg";
				
				fs.exists("Photos/Drawings/" + photo_name, function (exists) {
					if(exists){
						callback("error-sharing");
					} else {
						var bitmap = new Buffer(image_base64_str, 'base64');
						fs.writeFileSync("Photos/Drawings/" + photo_name, bitmap);
						
						var connection = mysql.createConnection({
							host     : host,
							user     : user,
							password : pw,
							database : database
						});
														
						connection.connect(function(err){
							if(err) {
								callback("-1"); //Database hatası
							}
						});
												
						connection.query("INSERT INTO tbl_shared(user_id, date, content, photo_name) values('" + socket.user_id + "', '" + date + "', '" + content + "', '" + photo_name + "')", function(err, rows, fields) {
							if(err){
								callback("-2"); //Query hatası
							}
							else {
								callback("successfully-shared");
							}
						});
						connection.end();
					}
				});
			}
			catch(e){
				callback("error-sharing");
			}
			
		}
	});
	
/////////KULLANICI ADINI DEĞİŞTİR////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('change-username', function(username, callback){
		if(username != null && username != "null" && username.length > 0 && socket.isLoggedIn){
			checkUsername(username, function(cb){
				if(cb == "1"){
					callback("username-already-exists");
				}
				else if(username.length < 3 || username.length >20) {
					callback("username-length-error");
				}
				else if(username.indexOf(" ") > -1) {
					callback("username-has-spaces");
				}
				else if(cb == "0") {
					var connection = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
									
					connection.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
					
					connection.query("UPDATE tbl_users SET username='" + username + "' WHERE user_id='" + socket.user_id + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else{
							socket.userName = username;
							callback("username-successfully-changed");
						}
					});
					connection.end();
				}
				else {
					callback("error");
				}
			});
		}
	});
	
/////////ŞİFRE DEĞİŞTİR//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('change-password', function(oldPassword, newPassword, callback){
		if(oldPassword != null && oldPassword != "null" && oldPassword.length > 0 && newPassword != null && newPassword != "null" && newPassword.length > 0 && socket.isLoggedIn){
			
			var specialChars = "<>@!#$%^&*()_+[]{}?:;|'\"\\,./~`-=";
			var check = function(string){
				for(i = 0; i < specialChars.length;i++){
					if(string.indexOf(specialChars[i]) > -1){
					   return true
					}
				}
				return false;
			}
			
			if(md5(oldPassword) != socket.password) {
				callback("wrong-current-password");
			}
			else if(newPassword.length<6 || newPassword.length>12) {
				callback("password-length-error");
			}
			else if(check(newPassword) == true) {
				callback("password-has-special-characters");
			}
			else if(newPassword.indexOf(" ") > -1) {
				callback("password-has-spaces");
			}
			else {
				var connection = mysql.createConnection({
					host     : host,
					user     : user,
					password : pw,
					database : database
				});
				
				connection.connect(function(err){
					if(err) {
						callback("-1"); //Database hatası
						}
				});
				
				connection.query("UPDATE tbl_users SET password='" + md5(newPassword) + "' WHERE user_id='" + socket.user_id + "'", function(err, rows, fields) {
					if(err){
						callback("-2"); //Query hatası
					}
					else{
						socket.password = md5(newPassword);
						callback("password-successfully-changed");
					}
				});
				connection.end();
			}
		}
	});
	
/////////BİYOGRAFİ DEĞİŞTİR//////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('change-biography', function(biography, callback){
		if(biography != null && biography != "null" && socket.isLoggedIn){
			if(biography.length<=200) {
				var connection = mysql.createConnection({
					host     : host,
					user     : user,
					password : pw,
					database : database
				});
				
				connection.connect(function(err){
					if(err) {
						callback("-1"); //Database hatası
					}
				});
				
				connection.query("UPDATE tbl_users SET biography='" + biography + "' WHERE user_id='" + socket.user_id + "'", function(err, rows, fields) {
					if(err){
						callback("-2"); //Query hatası
					}
					else{
						callback("biography-successfully-changed");
					}
				});
				connection.end();
			}
			else {
				callback("biography-lenght-error");
			}
		}
	});

/////////PROFİL FOTOĞRAFINI KALDIR///////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('remove-profile-photo', function(callback){
		if(socket.isLoggedIn){
			fs.unlink('Photos/ProfilePhotos/' + socket.user_id + '.jpg', function (err) {
				if(err) {
					callback("error");
				}
				callback("successfully-removed");
			});
		}
	});

/////////PROFİL FOTOĞRAFINI DEĞİŞTİR/////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('change-profile-photo', function(image_base64_str, callback){
		if(image_base64_str != null && image_base64_str != "null" && image_base64_str.length > 0 && socket.isLoggedIn){
			var photo_name = socket.user_id + ".jpg";
			var bitmap = new Buffer(image_base64_str, 'base64');
			
			fs.writeFile("Photos/ProfilePhotos/" + photo_name, bitmap, function(err) {
				if(err) {
					callback("error");
				}
				callback("successfully-changed");
			});
		}
	});
	
/////////E-POSTA ADRESİNİ DEĞİŞTİR///////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('change-mail', function(mail, lang, callback){
		if(mail != null && mail != "null" && mail.length > 0 && lang != null && lang != "null" && lang.length > 0 && socket.isLoggedIn){
			if(!validator.isEmail(mail)) {
				callback("email-invalid");
			}
			else {
				checkEmail(mail, function(cb){
					if (cb == "1") {
						callback("email-already-exists");
					}
					else if (cb == "0") {
						
						var connection = mysql.createConnection({
							host     : host,
							user     : user,
							password : pw,
							database : database
						});
							
						connection.connect(function(err){
							if(err) {
								callback("-1"); //Database hatası
							}
						});
						
						connection.query("UPDATE tbl_users SET e_mail = '" + mail + "' WHERE user_id=" + socket.user_id, function(err, rows, fields) {
							if(err){
								callback("-2"); //Query hatası
							}
							else {
								checkConfirmCode(socket.user_id, function(c){
									if (c.status == "0") {
										createCodeAndSendMail(socket.user_id, socket.userName, mail, lang, function(clbck) {
											if(clbck == "1") {
												socket.mail = mail;
												callback("mail-successfully-changed");
											}
											else {
												callback("error");
											}
										});
									}
									else if (c.status == "1") {
										var code = c.code;
										
										var connection = mysql.createConnection({
											host     : host,
											user     : user,
											password : pw,
											database : database
										});
													
										connection.connect(function(err){
											if(err) {
												callback("-1"); //Database hatası
											}
										});
											
										connection.query("DELETE FROM tbl_confirm_mail WHERE user_id='" + socket.user_id + "' AND code='" + code + "'", function(err, rows, fields) {
											if(err){
												callback("-2"); //Query hatası
											}
											else {
												createCodeAndSendMail(socket.user_id, socket.userName, mail, lang, function(clbck) {
													if(clbck == "1") {
														socket.mail = mail;
														callback("mail-successfully-changed");
													}
													else {
														callback("error");
													}
												});
											}
										});
										connection.end();
									}
									else {
										callback("error");
									}
								});
							}
						});
						connection.end();
					}
					else {
						callback("error");
					}
				});
			}
		}
	});

/////////E-POSTA ADRESİNİ ONAYLA/////////////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('confirm-mail', function(code, callback){
		if(code != null && code != "null" && code.length > 0 && socket.isLoggedIn){
			if(code.length != 5) {
				callback("invalid-code");
			}
			else {
				checkConfirmCode(socket.user_id, function(cb){
					if(cb.status == "1") {
						if(cb.code == code) {
							var connection = mysql.createConnection({
								host     : host,
								user     : user,
								password : pw,
								database : database
							});
													
							connection.connect(function(err){
								if(err) {
									callback("-1"); //Database hatası
								}
							});
								
							connection.query("DELETE FROM tbl_confirm_mail WHERE user_id='" + socket.user_id + "' AND code='" + code + "'", function(err, rows, fields) {
								if(err){
									callback("-2"); //Query hatası
								}
								else {
									callback("mail-successfully-confirmed");
								}
							});
						}
						else {
							callback("invalid-code");
						}
					}
					else {
						callback("error");
					}
				});
			}
		}
	});

/////////E-POSTA ONAY KODUNU TEKRAR GÖNDER///////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('resend-confirm-code', function(lang, callback){
		if(socket.isLoggedIn){
			checkConfirmCode(socket.user_id, function(cb){
				if(cb.status == "1") {
					var connection = mysql.createConnection({
						host     : host,
						user     : user,
						password : pw,
						database : database
					});
						
					connection.connect(function(err){
						if(err) {
							callback("-1"); //Database hatası
						}
					});
						
					connection.query("DELETE FROM tbl_confirm_mail WHERE user_id='" + socket.user_id + "'", function(err, rows, fields) {
						if(err){
							callback("-2"); //Query hatası
						}
						else {
							createCodeAndSendMail(socket.user_id, socket.userName, socket.mail, lang, function(clbck) {
								if(clbck == "1") {
									callback("code-successfully-sent");
								}
								else {
									callback("error");
								}
							});
						}
					});
				}
				else if(cb.status == "0") {
					createCodeAndSendMail(socket.user_id, socket.userName, socket.mail, lang, function(clbck) {
						if(clbck == "1") {
							callback("code-successfully-sent");
						}
						else {
							callback("error");
						}
					});
				}
				else {
					callback("error");
				}
			});
		}
	});	

/////////HESAP GİZLİLİK AYARINI DEĞİŞTİR/////////////////////////////////////////////////////////////////////////////////////////////
	
	socket.on('set-account-privacy', function(callback){
		if(socket.isLoggedIn){
			getIsProfileSecret(socket.user_id, function(cb) {
				if(cb == "1") {
					setPrivacy(socket.user_id, "0", function(c) {
						if(c == "success") {
							callback({status: "success", privacy: "0"});
						}
						else {
							callback({status: "error"});
						}
					});
				}
				else if(cb == "0") {
					setPrivacy(socket.user_id, "1", function(c) {
						if(c == "success") {
							callback({status: "success", privacy: "1"});
						}
						else {
							callback({status: "error"});
						}
					});
				}
				else {
					callback({status: "error"});
				}
			});
		}
	});		

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	socket.on('pong', function(data){
		if(socket.isLoggedIn) {
			console.log(socket.userName + " bağlantıya cevap verdi.");
		}
        else {
			socket.disconnect();
			console.log("Client giriş yapmadığı için bağlantısı sonlandırıldı.")
		}
    });	
	
	function updateNicknames(){
		io.sockets.emit('usernames', Object.keys(users));
	}
	
	socket.on('disconnect', function(data){
		if(!socket.user_id) return;
		console.log(socket.userName + " çıktı.");
		delete users[socket.user_id];
		updateNicknames();
	});
	
	function checkConfirmCode(uID, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback({status: "-1"}); //Database hatası
			}
		});
		
		connection.query("SELECT user_id, code FROM tbl_confirm_mail WHERE user_id = '" + uID + "'", function(err, rows, fields) {
			if(err){
				callback({status: "-2"}); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback({status: "1", code: rows[0].code}); //Kod var
				}
				else {
					callback({status: "0"}); //Kod yok
				}
			}
		});
		connection.end();
	}
	
	function checkLike(uID, photoName, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				return callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id, photo_name FROM tbl_likes WHERE user_id = '" + uID + "' AND photo_name = '" + photoName + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Beğenilmiş
				}
				else {
					callback("0"); //Beğenilmemiş
				}
			}
		});
		connection.end();
	}
	
	function checkPhoto(uID, photoName, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id, photo_name FROM tbl_shared WHERE user_id = '" + uID + "' AND photo_name = '" + photoName + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Fotoğraf var
				}
				else {
					callback("0"); //Fotoğraf yok
				}
			}
		});
		connection.end();
	}
	
	function checkNotification(uID, whose, photoName, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id, whose, photo_name, notification_type FROM tbl_notifications WHERE (user_id = '" + uID + "' AND whose = '" + whose + "') AND (photo_name = '" + photoName + "' AND notification_type = 'like')", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Bildirim var
				}
				else {
					callback("0"); //Bildirim yok
				}
			}
		});
		connection.end();
	}
	
	function checkVisibility(uID, followedID, callback){
		if(uID == followedID) {
			return callback("1"); //Görüntülenebilir
		}
		getIsProfileSecret(followedID, function(call){
			if(call == "1") {
				getIsFollowedUser(uID, followedID, function(cal){
					if(cal == "-1"){
						callback("1"); //Görüntülenebilir
					}
					else if(cal == "0"){
						callback("0"); //Görüntülenemez
					}
					else if(cal == "1"){
						callback("1"); //Görüntülenebilir
					}
					else if(cal == "2"){
						callback("0"); //Görüntülenemez
					}
					else {
						callback("-1"); //Hata
					}
				});
			}
			else if(call == "0"){
				callback("1"); //Görüntülenebilir
			}
			else {
				callback("-1"); //Hata
			}
		});
	}
	
	function setPrivacy(uID, privacy, callback) {
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("UPDATE tbl_users SET secret = '" + privacy + "' WHERE user_id = '" + uID + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				callback("success");
			}
		});
		connection.end();
	}
	
	function getIsProfileSecret(uID, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT secret FROM tbl_users WHERE user_id = '" + uID + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows[0].secret == 1) {
					callback("1"); //Profil gizli
				}
				else {
					callback("0"); //Profil gizli değil
				}
			}
		});
		connection.end();
	}
	
	function getIsFollowedUser(uID, followedID, callback){
		if(uID == followedID) {
			return callback("-1"); //Kendisi
		}
		else {
			var connection = mysql.createConnection({
				host     : host,
				user     : user,
				password : pw,
				database : database
			});

			connection.connect(function(err){
				if(err) {
					return callback("-2"); //Database hatası
				}
			});
			
			connection.query("SELECT user_id, followed_id from tbl_followed_lists where user_id = '" + uID + "' and followed_id = '" + followedID + "'", function(err, rows, fields) {
				if(err){
					callback("-3"); //Query hatası
				}
				else{
					if (rows.length == 0) {
						checkFollowRequest(uID, followedID, function(request){
							if(request == "1"){
								callback("2"); //Takip isteği gönderilmiş
							}
							else if(request == "0"){
								callback("0"); //Takip isteği gönderilmemiş
							}
							else {
								callback("-4"); //Hata
							}
						});
					}
					else {
						callback("1"); //Takip ediliyor
					}
				}
			});
			connection.end();
		}
	}
	
	function checkFollowRequest(uID, followedID, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				return callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id, followed_id, status FROM tbl_follow_requests WHERE user_id = '" + uID + "' AND followed_id = '" + followedID + "' AND status = '0'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Takip isteği gönderilmiş
				}
				else {
					callback("0"); //Takip isteği gönderilmemiş
				}
			}
		});
		connection.end();
	}

	function checkUser(uID, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				return callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id FROM tbl_users WHERE user_id = '" + uID + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Kullanıcı var
				}
				else {
					callback("0"); //Kullanıcı yok
				}
			}
		});
		connection.end();
	}
	
	function getPhotoOwner(photoName, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id FROM tbl_shared WHERE photo_name = '" + photoName + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if(rows.length > 0) {
					callback(rows[0].user_id);
				}
				else {
					callback("0"); //Kullanıcı bulunamadı
				}
			}
		});
		connection.end();
	}

	function getFollowRequests(callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT tbl_follow_requests.user_id, tbl_users.username, tbl_follow_requests.follow_date, tbl_follow_requests.seen, (IF('" + socket.user_id + "' = tbl_users.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id))) as is_followed FROM tbl_follow_requests INNER JOIN tbl_users ON tbl_users.user_id=tbl_follow_requests.user_id  WHERE tbl_follow_requests.status='0' AND tbl_follow_requests.followed_id='" + socket.user_id + "' ORDER BY tbl_follow_requests.id DESC", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				
				var connection = mysql.createConnection({
					host     : host,
					user     : user,
					password : pw,
					database : database
				});
				
				connection.connect(function(err){
					if(err) {
						callback("-1"); //Database hatası
					}
				});
				
				connection.query("UPDATE tbl_follow_requests SET seen='1' WHERE followed_id='" + socket.user_id + "'", function(err, rows, fields) {
					if(err){
						callback("-2"); //Query hatası
					}
				});
				
				if (rows.length > 0) {
					var follow_requests_array = [];
					for(var i = 0; i < rows.length; i++) {
						
						follow_requests_array.push(
							{
								user_id : rows[i].user_id,
								username : rows[i].username,
								follow_date : rows[i].follow_date,
								seen : rows[i].seen,
								is_followed : rows[i].is_followed
							}
						);
						
					}
					callback(follow_requests_array);
				}
				else {
					callback("0"); //Bildirim yok
				}
			}
		});
		connection.end();
	}
	
	function getNotifications(callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT tbl_notifications.user_id, tbl_users.username, tbl_notifications.notification_date, tbl_notifications.notification_type, tbl_shared.photo_name, (SELECT username FROM tbl_users WHERE user_id = tbl_shared.user_id) AS owner_username, tbl_shared.content, tbl_notifications.seen, (SELECT COUNT(*) FROM tbl_comments WHERE photo_name = tbl_shared.photo_name) AS comment_count, (SELECT COUNT(*) FROM tbl_likes WHERE photo_name = tbl_shared.photo_name) AS like_count, (IF('" + socket.user_id + "' = tbl_users.user_id, '-1', (SELECT IF(COUNT(*)>0, '1', (SELECT IF(COUNT(*)>0, '2', '0') FROM tbl_follow_requests WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id)) FROM tbl_followed_lists WHERE user_id='" + socket.user_id + "' AND followed_id=tbl_users.user_id))) as is_followed FROM tbl_notifications INNER JOIN tbl_users ON tbl_users.user_id=tbl_notifications.user_id LEFT JOIN tbl_shared ON tbl_shared.photo_name=tbl_notifications.photo_name WHERE tbl_notifications.whose='" + socket.user_id + "' ORDER BY tbl_notifications.id DESC LIMIT 25", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				
				var connection = mysql.createConnection({
					host     : host,
					user     : user,
					password : pw,
					database : database
				});
				
				connection.connect(function(err){
					if(err) {
						callback("-1"); //Database hatası
					}
				});
				
				connection.query("UPDATE tbl_notifications SET seen='1' WHERE whose='" + socket.user_id + "'", function(err, rows, fields) {
					if(err){
						callback("-2"); //Query hatası
					}
				});
				
				if (rows.length > 0) {
					var notifications_array = [];
					for(var i = 0; i < rows.length; i++) {
						
						notifications_array.push(
							{
								user_id : rows[i].user_id,
								username : rows[i].username,
								notification_date : rows[i].notification_date,
								notification_type : rows[i].notification_type,
								photo_name : rows[i].photo_name,
								owner_username : rows[i].owner_username,
								content : rows[i].content,
								like_count : rows[i].like_count,
								comment_count : rows[i].comment_count,
								seen : rows[i].seen,
								is_followed : rows[i].is_followed
							}
						);
						
					}
					callback(notifications_array);
				}
				else {
					callback("0"); //Bildirim yok
				}
			}
		});
		connection.end();
	}
	
	function getSharedDrawings(userID, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT date, content, photo_name, (SELECT COUNT(*) FROM tbl_comments WHERE photo_name = tbl_shared.photo_name) AS comment_count, (SELECT COUNT(*) FROM tbl_likes WHERE photo_name = tbl_shared.photo_name) AS like_count from tbl_shared WHERE user_id='" + userID + "' ORDER BY id DESC", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					var drawings_array = [];
					for(var i = 0; i < rows.length; i++) {
						
						drawings_array.push(
							{
								date : rows[i].date,
								content : rows[i].content,
								photo_name : rows[i].photo_name,
								like_count : rows[i].like_count,
								comment_count : rows[i].comment_count
							}
						);
						
					}
					callback(drawings_array);
				}
				else {
					callback("0"); //Çizim yok
				}
			}
		});
		connection.end();
	}
	
});

	function createCodeAndSendMail(userID, username, mail, lang, callback) {
		var code = "";
		function random (low, high) {
			return Math.floor(Math.random() * (high - low) + low);
		}
					
		for (var i = 0; i < 5; i++)
		{
			code += characters[random(0, characters.length-1)];
		}
				
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
													
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("INSERT INTO tbl_confirm_mail(user_id, code) values('" + userID + "', '" + code + "')", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else {
				sendMail(userID, username, mail, lang, code, function(call) {
					if (call == "mail-sent") {
						callback("1");
					}
					else {
						callback("0");
					}
				});
			}
		});
		connection.end();
	}

	function sendMail(userID, userName, mail, lang, code, callback) {
		fs.exists("Language/" + lang, function (exists) {
			var l;
			if(exists){
				l = require('./Language/' + lang + '.js')
			}
			else {
				l = require('./Language/tr.js')
			}
	
			var mailDesign = '<html>' +
				'<body style="width: 100%;height: 100%;margin: 0;padding: 0;font-family: \'Comic Sans MS\', sans-serif;color: #fff;background: #e74c3c;">' +
					'<div id="top" style="width: 100%;height: 25px;background: rgba(255, 255, 255, 0.2);"></div>' +
					'<div id="header" style="text-align: center;background: #d94839; padding: 3em;">' +
						'<h1 style="font-size: 2.625em;line-height: 1.3;margin: 0;">' +
							'Fobilo' +
							'<span style="display: block;font-size: 60%;opacity: 0.7;padding: 0 0 0.6em 0.1em;">' + l.header + '</span>' +
						'</h1>' +
					'</div>' +
					'<div id="main" style="text-align: center;padding: 3em;">' +
						'<h1 style="display: block;font-size: 2em;-webkit-margin-before: 0.67em;-webkit-margin-after: 0.67em;-webkit-margin-start: 0px;-webkit-margin-end: 0px;font-weight: bold;">' +
							l.hello + ' ' + userName + ',<br/><br/>' +
							'<span style="font-size:23px;">' +
								l.description + '<br/>' +
								mail + '<br/>' +
								l.info + '<br/>' +
								'<div style="padding: 1em;background: #FF9800;display: table;margin: 30px auto 50px auto;text-decoration: none;color: #fff;-webkit-border-radius: 5px;-moz-border-radius: 5px;border-radius: 5px;">' +
									code +
								'</div>' +
							'<span><br>' +
							'<img src="' + hostAddress + '/SiteImages/mustache.png" width="150"/>' +
						'</h1>' +
					'</div>' +
				'</body>' +
			'</html>';
				
			var transporter = nodemailer.createTransport({
				service: mailService,
				auth: {
					user: hostMail,
					pass: hostMailPassword
				}
			});
		
			var mailOptions = {
				from: 'Fobilo ' + '<' + hostMail + '>',
				to: mail, 
				subject: l.header,
				text: '',
				html: mailDesign
			};
			
			transporter.sendMail(mailOptions, function(error, info){
				if(error){
					callback("error");
				}
				callback("mail-sent");
			});
		});
	}

	function getUserID(username, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT user_id FROM tbl_users WHERE username = '" + username + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if(rows.length > 0) {
					callback(rows[0].user_id);
				}
				else {
					callback("0"); //Kullanıcı bulunamadı
				}
			}
		});
		connection.end();
	}

	function checkUsername(username, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				return callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT username FROM tbl_users WHERE username = '" + username + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Kullanıcı var
				}
				else {
					callback("0"); //Kullanıcı yok
				}
			}
		});
		connection.end();
	}
	
	function checkEmail(email, callback){
		var connection = mysql.createConnection({
			host     : host,
			user     : user,
			password : pw,
			database : database
		});
		
		connection.connect(function(err){
			if(err) {
				return callback("-1"); //Database hatası
			}
		});
		
		connection.query("SELECT e_mail FROM tbl_users WHERE e_mail = '" + email + "'", function(err, rows, fields) {
			if(err){
				callback("-2"); //Query hatası
			}
			else{
				if (rows.length > 0) {
					callback("1"); //Email var
				}
				else {
					callback("0"); //Email yok
				}
			}
		});
		connection.end();
	}

setTimeout(sendHeartbeat, 8000);