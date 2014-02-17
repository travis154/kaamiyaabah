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

var User = db.model('user', Schema.User);
var Member = db.model('member', Schema.Member);
var SMS = db.model('sms', Schema.SMS);
var People = db.model('People', Schema.People);
var Search = db.model('Search', Schema.Search);

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
app.set('port', process.env.PORT || 3038);
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
app.use(jade_browser('/templates2.js', '**', {root: __dirname + '/views/components', cache:false, maxAge:0}));	
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
	
	data.specialized_constituency = JSON.parse(data.specialized_constituency);
	data.role = JSON.parse(data.role);
	data.appointed_location = JSON.parse(data.appointed_location);
	
	data.ip = req.ip;
	data.user = req.user.username;
	data.time = new Date();
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
	data.specialized_constituency = JSON.parse(data.specialized_constituency);
	data.role = JSON.parse(data.role);
	data.appointed_location = JSON.parse(data.appointed_location);
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
	console.log(req.body);
	var recipient_type = req.body.type.toLowerCase();
	var recipients = JSON.parse(req.body.recipients);
	var data = req.body;
	var message = req.body.message;
	
	data.message = message;
	data.ip = req.ip;
	data.user = req.user.username;
	data.time = new Date()
	
	var sms = new SMS(data);
	sms.recipients_type = recipient_type;
	sms.recipients = recipients;
	//save dn
	sms.save(function(err, rec){
		res.json(rec);
	});
	if(recipient_type == "members" || recipient_type == "voters"){

		return Member
		.find({appointed_location:{$in:recipients}},{personal_mobile:1})
		.lean()
		.exec(function(err, people){
			var recipients = _.map(people, function(r){return r.personal_mobile});
			sendsms(message, recipients);
		});
	}else{
		sendsms(message, recipients);
	}
});

function sendsms(message, recipients){
	async.eachLimit(recipients, 5, function(item, done){
		var post = {
			api_key:conf.nexmo.key,
			api_secret:conf.nexmo.secret,
			from:"RIYAZ 2014",
			to:"960" + item,
			text:message
		}
		request({
			url:"https://rest.nexmo.com/sms/json",
			method:"POST",
			form:post
		});		
		return done();	
	});
}

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
	var options = {can_vote:{$ne:false}};
	if(!req.xhr){
		return res.render('voters');
	}
	if(req.query.search){
		var q = new RegExp(req.query.search, "i");
		options.$or = [];
		options.$or.push({name:q});
		options.$or.push({national_id:q});
		options.$or.push({address:q});
		new Search({
			query:req.query.search,
			time:new Date(),
			user:req.user.username,
			ip:req.ip
		}).save();
		
	}
	People.find(options,{log:0})
	.lean()
	.exec(function(err, ppl){
		if(err) throw err;
		res.json(ppl);
	});
});
app.get('/voters/:id', authenticate, function(req,res){
	var id = req.params.id;
	People.findOne({_id:id}, function(err, person){
		res.json({person:person});
	});
});
app.post('/voters/:id/survey', authenticate, function(req,res){
	var field = req.body.field;
	var value = req.body.value;
	var id = req.params.id;
	var update = {$set:{}};
	var val = value.trim();
	update.$set[field] = val;
	update.$push = {};
	update.$push['log'] = {
		updated:new Date(),
		field:field,
		value:val,
		user:req.user.username
	};
	People.update({_id:id},update, function(err, changed){
		if(err) throw err;
		res.json(changed);
	});
});
app.get('/reports', function(req,res){
	async.auto({
		votes:function(fn){
			People.aggregate()
				.match({})
				.group({_id:'$votes', val:{$sum:1}})
				.exec(fn);
		}
	},function(err, page){
		page.votes = _.map(page.votes, function(e){if(e._id == null){e._id = "Ghost";}return e;});
		res.render('reports',page);
	});
});
http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
