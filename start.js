var forever = require('forever-monitor');
var child = new (forever.Monitor)('server.js', {
 max: 100,
 silent: false,
});

child.on('exit', function () {
 console.log('server.js has exited');
});

child.start();