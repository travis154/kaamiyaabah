/**
 * Module dependencies.
 */
var _ = require('underscore');
var express = require('express');
var http = require('http');
var path = require('path');
var mongoose = require('mongoose');
var async = require('async');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var moment = require('moment');
var MongoStore = require('connect-mongo')(express);
var request = require('request');
var jade_browser = require('jade-browser');

var conf = require('./conf');

var sessionStore = new MongoStore({db:conf.db});
var Schema = require('./lib/Schema');

//models
var db = mongoose.createConnection("mongodb://127.0.0.1/" + conf.db);
var people_db = mongoose.createConnection("mongodb://127.0.0.1/people");

var User = db.model('user', Schema.User);
var Member = db.model('member', Schema.Member);
var SMS = db.model('sms', Schema.SMS);
var People = people_db.model('People', Schema.People);

//create admin user if not exist
User.createIfNotExists({username:'test', password:'test', name:'Test User', type:'supervisor'});


passport.use(new LocalStrategy({
		usernameField: 'username',
		passwordField: 'password',
		passReqToCallback: true
	},
	function(req, username, password, done) {
		User.authenticate({username:username, password:password}, function(err, res){
			if(err) return done(err);
			if(res){
				done(null, username);
			}else{
				done(null, false, {message: "Incorrect login details"});
			}
		});
	}
));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(id, done) {
	User.findOne({username:id}, function(err, user){
		if(!err) done(null, user);
		else done(err, null)  
	})
});

var app = express();

// all environments
app.set('port', process.env.PORT || 3037);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.cookieParser(conf.cookie_secret));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.session({ secret: conf.cookie_secret, store: sessionStore, cookie: { maxAge: 1000 * 60 * 60 * 7 * 1000 ,httpOnly: false, secure: false}}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.compress());
app.use(require('stylus').middleware({ src: __dirname + '/public' }));
app.use(jade_browser('/templates.js', '**', {root: __dirname + '/views/components', cache:false}));	
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}
function authenticate(req,res,next){
	if (req.isAuthenticated()) { return next(); }
	if (req.xhr){
		return res.json({error:"authentication failed"});
	}else{
		return res.redirect('/login');
	}
}

app.get('/', authenticate, function(req,res){
	async.auto({
		count: function(fn){
			Member.count(fn);
		},
		latest_mem:function(fn){
			Member
			.findOne({},{business_name:1})
			.sort({_id:-1})
			.exec(function(err, doc){
				var name = doc ? doc.business_name : null;
				fn(err, name);
			});
		}
	}, function(err, data){
		if(err) throw err;
		data.usertype = req.user.type.toLowerCase();
		res.render('index',data);
	});
});
app.get('/members', authenticate, function(req,res){
	Member
	.find()
	.sort({_id:-1})
	.lean()
	.exec(function(err, members){
		members = _.map(members,function(e){
			e.time = moment(e.time).format("Do MMM YY");
			return e;
		});
		res.render('members', {members:members});
	});
});
app.get('/members/register', authenticate, function(req,res){
	res.render('register');
});
app.post('/members/register', authenticate, function(req,res){
	var data = req.body;
	data.ip = req.ip;
	data.user = req.user.username;
	data.time = new Date()
	var mem = new Member(data);
	mem.save(function(err, member){
		if(err) throw err;
		res.json(member);
	});
});
app.get('/members/:id', authenticate, function(req,res){
	Member
	.findOne({_id:req.params.id})
	.lean()
	.exec(function(err, member){
		if(err) throw err;
		if(!member){
			return res.redirect('/members');
		}
		res.render('register', {member:member});
	});
});
app.del('/members/:id', authenticate, function(req,res){
	Member
	.remove({_id:req.params.id},function(err){
		res.json({success:1});
	});
});
app.post('/members/:id', authenticate, function(req,res){
	var id = req.params.id;
	var data = req.body;
	Member.update({_id:id}, data, function(err, member){
		if(err) throw err;
		res.json(member);
	});
});

app.get('/login', function(req,res){
	res.render('login');
});
app.get('/user/password', authenticate, function(req,res){
	res.render('password');
});
app.post('/user/password', authenticate, function(req,res){
	var pass = req.body.password_new;
	User.changePassword({username:req.user, password:pass}, function(err, change){
		res.redirect('/logout');
	});
});
app.get('/users', authenticate, function(req,res){
	User
	.find()
	.sort({_id:-1})
	.lean()
	.exec(function(err, users){
		res.render('users', {users:users});
	});
});
app.del('/user/:id', authenticate, function(req,res){
	User
	.remove({_id:req.params.id},function(err){
		res.json({success:1});
	});
});
app.get('/user/add', authenticate, function(req,res){
	res.render('user-add');
});
app.post('/user/add', authenticate, function(req,res){
	var data = req.body;
	data.password = "welcome";
	data.ip = req.ip;
	data.user = req.user.username;
	data.time = new Date()
	var user = new User(data);
	user.save(function(err, user){
		if(err) throw err;
		res.json(user);
	});
});
app.get('/sms', authenticate, function(req,res){
	SMS
	.find()
	.sort({_id:-1})
	.exec(function(err, jobs){
		res.render('sms', {jobs:jobs});
	});
});
app.post('/sms', authenticate, function(req,res){
	//find recipients based on membership type
	var recipient_type = req.body.recipient_type;
	var recipient_type_query = req.body.recipient_type == "Everyone" ? new RegExp('.','g') : req.body.recipient_type.replace("Members", "").trim();
	Member
	.find({membership:recipient_type_query},{_id:1, personal_mobile:1})
	.exec(function(err, recs){
		if(err) throw err;
		if(!recs){
			return res.json({error:'no one to send'});
		}
		var data = req.body;
		data.message = req.body.sms_message;
		data.ip = req.ip;
		data.user = req.user.username;
		data.time = new Date()
		
		var sms = new SMS(data);
		sms.recipients_type = recipient_type
		sms.recipients = recs;
		//save dn
		sms.save(function(err, rec){
			res.json(rec);
		});
		//send sms
		async.eachLimit(recs, 5, function(item, done){
			var post = {
				api_key:conf.nexmo.key,
				api_secret:conf.nexmo.secret,
				from:"test",
				to:"960" + item.personal_mobile,
				text:data.message
			}
			request({
				url:"https://rest.nexmo.com/sms/json",
				method:"POST",
				form:post
			});		
		});
		
	});
});
app.get('/sms/balance', function(req, res){
	request({
		url:"https://rest.nexmo.com/account/get-balance/" + conf.nexmo.key + "/" + conf.nexmo.secret,
		method:"GET",
		headers:{
			"Accept":"application/json"
		}
	}, function(err, resp, body){
		try{
			var body = JSON.parse(body);
			res.json({
				balance:body.value
			});
		}catch(e){
			res.json({
				balance:0
			});
			
		}
	});

});
app.post(
	'/login',
	passport.authenticate('local', {
		successRedirect:'/',
		failureRedirect:'/login'
	})
);

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/login');
});

app.get('/voters', authenticate, function(req,res){
	var options = {};
	if(!req.xhr){
		return res.render('voters');
	}
	options.island = "Gdh " + req.query.island;
	if(req.query.search){
		var q = new RegExp(req.query.search, "i");
		options.$or = [];
		options.$or.push({name:q});
		options.$or.push({national_id:q});
		options.$or.push({address:q});
	}
	People.find(options, function(err, ppl){
		if(err) throw err;
		res.json(ppl);
	});
});
app.get('/voters/:id', authenticate, function(req,res){
	var id = req.params.id;
	People.findOne({_id:id}, function(err, person){
		res.render('voter-profile',{person:person});
	});
});
app.post('/voters/:id/survey', authenticate, function(req,res){
	var field = req.body.field;
	var value = req.body.value;
	var id = req.params.id;
	var update = {$set:{}};
	update.$set[field] = value.trim();
	console.log(id);
	People.update({_id:id},update, function(err, changed){
		if(err) throw err;
		res.json(changed);
	});
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
