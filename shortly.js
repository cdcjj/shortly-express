var express = require('express');
var passport = require('passport');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var flash = require('req-flash');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');
var GitHubStrategy = require('passport-github2').Strategy;


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

// var GITHUB_CLIENT_ID = "--insert-github-client-id-here--";
// var GITHUB_CLIENT_SECRET = "--insert-github-client-secret-here--";

// Passport session setup.
//   To support persistent login sessions, the complete GitHub profile is serialized
//   and deserialized.
// passport.serializeUser(function(user, done) {
//   done(null, user);
// });
//
// passport.deserializeUser(function(obj, done) {
//   done(null, obj);
// });


// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
// passport.use(new GitHubStrategy({
//     clientID: GITHUB_CLIENT_ID,
//     clientSecret: GITHUB_CLIENT_SECRET,
//     callbackURL: "http://127.0.0.1:3000/auth/github/callback"
//   },
//   function(accessToken, refreshToken, profile, done) {
//     // asynchronous verification, for effect...
//     process.nextTick(function () {
//
//       // To keep the example simple, the user's GitHub profile is returned to
//       // represent the logged-in user.  In a typical application, you would want
//       // to associate the GitHub account with a user record in your database,
//       // and return that user instead.
//       return done(null, profile);
//     });
//   }
// ));


var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(session({
  secret: 'nyan-cat',
  resave: true,
  saveUninitialized: true,
  cookie: {maxAge: 7.2e+6},
  cookieName: 'testing'
}));
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
// app.use(passport.initialize());
// app.use(passport.session());

app.use(flash());
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var checkUser = function(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Acess Denied';
    res.redirect('login');
  }
};

app.get('/', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', checkUser,
function(req, res) {
  console.log('shortlyjs /create');
  res.render('index');
});

app.get('/links', checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.get('/login',
function(req, res) {
  res.render('login');
});

app.post('/login',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch()
    .then(function(found) {
      if (found === null) {
        req.flash('error', 'Username incorrect');
        res.redirect('/login');
      } else if (found) {
        bcrypt.compare(password, found.get('password'), function(err, match) {
          if (err) {
            throw err;
          }
          if (match) {
            req.session.regenerate(function(err) {
              req.session.user = username;
              req.flash('success', 'successful login');
              res.redirect('/');
            });
          } else {
            req.flash('error', 'Wrong Password');
            res.redirect('/login');
          }
        });
      }
    });
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/signup',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch().then(
    function(found) {
      if (found) {
        req.flash('error', 'username already exists');
        res.redirect('/signup');
      } else {
        Users.create({
          username: req.body.username,
          password: req.body.password
        })
        .then(function(newUser) {
          req.session.regenerate(function(err) {
            req.session.user = username;
            res.redirect('/');
          });
        });
      }
    }
  );
});


app.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      throw err;
    } else {
      res.redirect('/login');
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
