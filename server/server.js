import express from 'express';
import bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import proxy from 'express-http-proxy';
import path from 'path';

import React from 'react';
import { RoutingContext, match } from 'react-router';
import { Provider } from 'react-redux';
import createLocation from 'history/lib/createLocation';

import store from 'redux/store';
import routes from 'redux/routes';

import { fetchQuestions, initVotes, fetchWorldviews } from 'redux/modules/voting';


const app = express();
const port = process.env.PORT || 3000;

const isDev = process.env.NODE_ENV === 'development';
const isDebug = process.env.DEBUG;

app.use(compression());
app.use(bodyParser.json());
app.use(cookieParser());

if (isDev && isDebug && process.env.DEBUG.indexOf('shrimp:front') === 0) {
  const webpack = require('webpack');
  const makeConfig = require('../make-webpack-config.js');

  const config = makeConfig({
    sourcemaps: false,
    devtool: 'eval',
  });
  const compiler = webpack(config);

  app.use(require('webpack-dev-middleware')(compiler, {
    noInfo: true,
    publicPath: config.output.publicPath,
  }));

  app.use(require('webpack-hot-middleware')(compiler));
}
app.use('/static', express.static(path.join(__dirname, '../static')));

function renderFullPage(html, initialState) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Izm</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Roboto:300,400,500,700" type="text/css">
        <link rel="apple-touch-icon" sizes="57x57" href="/static/favicons/apple-touch-icon-57x57.png">
        <link rel="apple-touch-icon" sizes="60x60" href="/static/favicons/apple-touch-icon-60x60.png">
        <link rel="apple-touch-icon" sizes="72x72" href="/static/favicons/apple-touch-icon-72x72.png">
        <link rel="apple-touch-icon" sizes="76x76" href="/static/favicons/apple-touch-icon-76x76.png">
        <link rel="apple-touch-icon" sizes="114x114" href="/static/favicons/apple-touch-icon-114x114.png">
        <link rel="apple-touch-icon" sizes="120x120" href="/static/favicons/apple-touch-icon-120x120.png">
        <link rel="apple-touch-icon" sizes="144x144" href="/static/favicons/apple-touch-icon-144x144.png">
        <link rel="apple-touch-icon" sizes="152x152" href="/static/favicons/apple-touch-icon-152x152.png">
        <link rel="icon" type="image/png" href="/static/favicons/favicon-32x32.png" sizes="32x32">
        <link rel="icon" type="image/png" href="/static/favicons/favicon-96x96.png" sizes="96x96">
        <link rel="icon" type="image/png" href="/static/favicons/favicon-16x16.png" sizes="16x16">
        <link rel="manifest" href="/static/favicons/manifest.json">
        <link rel="shortcut icon" href="/static/favicons/favicon.ico">
        <meta name="msapplication-TileColor" content="#009688">
        <meta name="msapplication-TileImage" content="/static/favicons/mstile-144x144.png">
        <meta name="msapplication-config" content="/static/favicons/browserconfig.xml">
        <meta name="theme-color" content="#009688">
      </head>
      <body>
        <div id="root">${html}</div>
        <script>
          window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
        </script>
        <script src="/static/bundle.js"></script>
        <!-- Yandex.Metrika counter -->
        <script type="text/javascript">
            (function (d, w, c) {
                (w[c] = w[c] || []).push(function() {
                    try {
                        w.yaCounter = new Ya.Metrika({
                            id:33181593,
                            clickmap:true,
                            trackLinks:true,
                            accurateTrackBounce:true,
                            webvisor:true
                        });
                    } catch(e) { }
                });

                var n = d.getElementsByTagName("script")[0],
                    s = d.createElement("script"),
                    f = function () { n.parentNode.insertBefore(s, n); };
                s.type = "text/javascript";
                s.async = true;
                s.src = "https://mc.yandex.ru/metrika/watch.js";

                if (w.opera == "[object Opera]") {
                    d.addEventListener("DOMContentLoaded", f, false);
                } else { f(); }
            })(document, window, "yandex_metrika_callbacks");
        </script>
        <noscript><div><img src="https://mc.yandex.ru/watch/33181593" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
        <!-- /Yandex.Metrika counter -->
      </body>
    </html>
    `;
}

function handleRender(req, res) {
  const location = createLocation(req.url);
  match({ routes, location }, (error, redirectLocation, renderProps) => {
    if (redirectLocation) {
      res.redirect(301, redirectLocation.pathname + redirectLocation.search);
    } else if (error) {
      res.status(500).send(error.message);
    } else if (renderProps === null) {
      res.status(404).send('Not found');
    } else {
      Promise.all([
        store.dispatch(fetchWorldviews()),
        store.dispatch(fetchQuestions()),
      ]).then(
        () => {
          const votesFromCookies = {};
          Object.keys(req.cookies).map(key => {
            if (key.indexOf('vote_in_') === 0) {
              const questionId = key.slice(8);
              votesFromCookies[questionId] = req.cookies[key];
            }
          });
          store.dispatch(initVotes(votesFromCookies));
          const html = React.renderToString(
            <div>
              <Provider store={store}>
                {() =>
                  <RoutingContext {...renderProps}/>
                }
              </Provider>
            </div>
          );
          const initialState = store.getState();
          res.send(renderFullPage(html, initialState));
        }
      );
    }
  });
}

process.env.API_ENDPOINT = process.env.API_ENDPOINT || 'http://izm.io:8888';
app.use('/api', proxy(process.env.API_ENDPOINT, {
  forwardPath: function(req, res) {
    return req.url.replace('/api/', '/');
  },
}));
app.get('*', handleRender);
app.listen(port);
