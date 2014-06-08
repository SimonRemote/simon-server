#!/usr/bin/env node

var WebSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(200, {"Content-Type": "text/plain"});
      response.write("Hello World!");
    response.end();
});
server.listen(process.env.PORT, function() {
    console.log((new Date()) + ' Server is listening on port 80');
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}


// sending a message to id=0 will send to all devices of the other type. 
var curr_id = 1;
var table = {};

function isset(obj) {
    return (typeof obj != "undefined");
}

function otherType(type) {
    return (type === "controllers") ? "listeners" : "controllers";
}

function printTable() {
    var i;
    console.log("\n-------Printing Table------------------");
    for (var channelKey in table) {
        var lists = table[channelKey];
        console.log("CHANNEL: " + channelKey);
        for (var listKey in lists) {
            console.log(listKey);
            var list = lists[listKey];
            for (var connectionKey in list) {
                var connection = list[connectionKey];
                console.log(connection.info);
            }
        }
    }
    console.log("---------------------------------------\n");
}

function deleteConnection(connection) {
    var channel = table[connection.info.channelKey];
    if (!isset(channel)) {
        return;
    }

    var list = channel[connection.info.listKey];

    if (list.length > 0) {
        deleteListEntry(list, connection.info.id);
    }

    deleteIfEmpty(connection.info.channelKey);
}

function deleteListEntry(list, id) {
    for (var i=0; i<list.length; i++) {
        if (list[i].info.id === id) {
            list.splice(i, 1);
        }
    }
}

function deleteIfEmpty(channelKey) {
    var channel = table[channelKey];

    if (isset(channel)) {
        if (isset(channel.listeners) &&
                channel.listeners.length === 0 &&
                isset(channel.controllers) &&
                channel.controllers.length === 0) {
            delete table[channelKey];
        }
    }
}

function storeConnection(channelKey, listKey, connection) {
    var channel = table[channelKey];

    /* if channel exists already */
    if (isset(channel)) {
        channel[listKey].push(connection);

    /* if channel does not exist */
    } else {

        /* create new object then push connection */
        table[channelKey] = {listeners: [], controllers: []};
        channel = table[channelKey];
        channel[listKey].push(connection);
    }
}

function getConnection(channelKey, listKey, id) {
    var channel = table[channelKey];

    if (isset(channel)) {

        /* grab appropriate list */
        var list = channel[listKey];

        /* search list for id and return connection */
        for (var i=0; i<list.length; i++) {
            if (list[i].info.id === id) {
                console.log("returning connection");
                return list[i];
            }
        }
    }

    /* could not find connection */
    return;
}

function getListForChannel(channelKey, listKey) {
    var channel = table[channelKey];

    if (isset(channel)) {
        return channel[listKey];
    }
    return;
}

function broadcastMessage(channelKey, listKey, msg) {
    var connections = getListForChannel(channelKey, listKey);
    if (!isset(connections)) {
        return;
    }

    for (var i=0; i<connections.length; i++) {
        connections[i].send(msg);
    }
}

function sendMessage(channelKey, listKey, id, msg) {
    var connection = getConnection(channelKey, listKey, id);

    if (!isset(connection)) {
        return;
    }

    connection.send(msg);
}

// function rejectListener(registration, connection) {
//     var response;
//     response = JSON.stringify({
//         type: "status",
//         status: {
//             connected: false,
//             message: "Error: " + registration.channel,
//             channel: registration.channel,
//             connectedTo: []
//         }
//     });
//     connection.sendUTF(response);
//     connection.close();

//     console.log("A Listener has been rejected on channel: " + registration.channel);
// }

// function rejectController(registration, connection) {
//     var response;
//     response = JSON.stringify({
//         type: "status",
//         status: {
//             connected: false,
//             message: "Error: " + registration.channel,
//             channel: registration.channel,
//             connectedTo: []
//         }
//     });
//     connection.sendUTF(response);
//     connection.close();

//     console.log("A Controller has been rejected on channel: " + registration.channel);
// }

function alertChannelOfChangedConnection(channelKey, listKey) {
    var sameTypeConnections = getListForChannel(channelKey, listKey);
    var otherTypeConnections = getListForChannel(channelKey, otherType(listKey));
    var numDevices;

    if(isset(otherTypeConnections)) {
        numDevices = otherTypeConnections.length;
    }

    for (var key in sameTypeConnections) {
        var connection = sameTypeConnections[key];
        var response = JSON.stringify({
            type: "status",
            status: {
                connected: true,
                message: "Registered on channel " + channelKey,
                channel: channelKey,
                numConnections: numDevices || 0
            }
        });
        connection.sendUTF(response);
    }
}

function sendStatusToConnection(connection) {
    var otherTypeConnections = getListForChannel(connection.info.channelKey, otherType(connection.info.listKey));
    var numDevices;

    if(isset(otherTypeConnections)) {
        numDevices = otherTypeConnections.length;
    }

    var response = JSON.stringify({
        type: "status",
        status: {
            connected: true,
            message: "Registered on channel " + connection.info.channelKey,
            channel: connection.info.channelKey,
            numConnections: numDevices || 0
        }
    });
    console.log(response);
    connection.sendUTF(response);
}

function registerDevice(registration, connection) {

    if (!isset(registration)) {
        console.log("no registration in registration message");
        return;
    }

    var _listKey = (registration.isListener === true) ? "listeners" : "controllers";

    connection.info.channelKey = registration.channel;
    connection.info.listKey = _listKey;

    storeConnection(registration.channel, _listKey, connection);
    alertChannelOfChangedConnection(registration.channel, otherType(_listKey));
    sendStatusToConnection(connection);
}   

function handleMessage(message, connection, idTo) {
    var channel = connection.info.channelKey;
    message.idFrom = connection.info.id;
    var json = JSON.stringify({
        type: "message",
        "message": message
    });

    if (!isset(channel)) {
        console.log("channel key not set in connection");
        return;
    }

    if (idTo === 0) {
        // send to each device of opposite type on same channel
        broadcastMessage(channel, otherType(connection.info.listKey), json);
    
    } else if (idTo > 0) {
        // send to individual connection
        sendMessage(channel, otherType(connection.info.listKey), idTo, json);
    } else {
        console.log("idTo not set");
    }
}

function handleInfo(info, connection, idTo) {
    var channel = connection.info.channelKey;
    if (!isset(channel)) {
        console.log("channel key not set in connection");
    }

    var json = JSON.stringify(info);

    if (idTo === 0) {
        broadcastMessage(channel, otherType(connection.info.listKey), json);
    } else if (idTo > 0) {
        // send to individual connection
        sendMessage(channel, otherType(connection.info.listKey), idTo, json);
    } else {
        console.log("idTo not set");
    }
}



wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {

        /* Make sure we only accept requests from an allowed origin */
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    /* accept WebSocket connections using the 'pebble' protocol */
    var connection = request.accept(null, request.origin);
    connection.info = {};
    connection.info.id = curr_id++;
    console.log((new Date()) + ' Connection accepted.');

    /* when a message is received */
    connection.on('message', function(message) {
        var msg = JSON.parse(message.utf8Data);

        console.log(msg);

        switch (msg.type) {
            case "registration":
                registerDevice(msg.registration, connection);
                printTable();
                break;
            case "message":
                handleMessage(msg.message, connection, msg.idTo);
                break;
            case "info":
                handleInfo(msg, connection, msg.idTo);
                console.log(msg);
                break;
            default:
                console.log("Unknown message type\n----------------");
                console.log(msg);
                console.log("----------------\n");
                break;
        }


    });

    /* when a connection is closed */
    connection.on('close', function(reasonCode, description) {
        var id = connection.info.id;
        var channelKey = connection.info.channelKey;
        var listKey = connection.info.listKey;

        console.log((new Date()) + 'Disconnection :: channel: ' + channelKey + '  id: ' + id + '  list: ' + listKey);
        deleteConnection(connection);
        alertChannelOfChangedConnection(channelKey, otherType(listKey));
    });

    // connection.on('error', function(reasonCode, description) {
    //     console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' errored out with channel: ' + connection.info.channelKey);
    //     //alert everyone
    // });
});