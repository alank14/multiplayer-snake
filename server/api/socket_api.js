// Snake socket API
"use strict";
class SocketAPI {

    /**
     * Initializes snake socket API and game instance.
     * @param {Number} port - port to listen on
     * @param {Number} numRooms - number of rooms
     * @param {Number} boardSize - board size
     */
    startService(port, numRooms, boardSize) {
        var Snake = require('../snake/snake.js');
        var socket_io = require('socket.io')();

        // Init each room
        this.rooms = [];
        for (var roomID = 0; roomID < numRooms; roomID++) {
            var room = {};
            room.id = roomID;

            // Create snake instance
            room.snake = new Snake(boardSize);
            room.snake.setGameEventListener(this._gameEvent.bind(this));

            // Reverse reference back to room
            room.snake.room = room;

            // Maps playerID to socket
            room.sockets = {};
            this.rooms.push(room);
        }

        // Init socket.io
        socket_io.on('connection', this._onConnection.bind(this));
        socket_io.listen(port);
    }

    /**
     * Handles new connection event.
     * @param {socket} socket - socket instance
     */
    _onConnection(socket) {
        // Mark socket as not started
        socket.gameStarted = false;

        // Socket.io events
        // listRooms (List all rooms)
        socket.on('list_rooms', function() {
            var list = [];
            for (var roomID in this.rooms) {
                var sockets = this.rooms[roomID].sockets;
                list.push({id: roomID,
                           numPlayers: Object.keys(sockets).length});
            }

            socket.emit('room_list', list);
        }.bind(this));

        // start - a player joins
        socket.on('start', function(data) {
            // Cancel if already started
            if (socket.gameStarted) return;

            // Remove previous socket reference if exists
            this._removeSocket(socket);

            var roomID = data[0];
            var playerName = data[1];

            var room = this.rooms[roomID];
            if (typeof room === 'undefined') return;

            var snake = room.snake;
            var playerID = snake.startPlayer();

            // Assign player information
            socket.gameStarted = true;
            socket.roomID = roomID;
            socket.playerID = playerID;
            socket.playerName = playerName;

            // Add socket to set and map from playerID
            room.sockets[playerID] = socket;

            // Notify client
            socket.emit('started', playerID);

            // Broadcast join message
            this._sendRoomMessage(roomID, playerID, playerName, ' joined.');
        }.bind(this));

        // keystroke - player presses a key
        socket.on('keystroke', function(data) {
            if (!socket.gameStarted) return;

            var roomID = socket.roomID;
            var room = this.rooms[roomID];
            if (typeof room === 'undefined') return;
            room.snake.keyStroke(socket.playerID, data);
        }.bind(this));

        // disconnect - player disconnects
        socket.on('disconnect', function() {
            this._removeSocket(socket);
        }.bind(this));
    }

    /**
     * Removes socket from all tracking data structures.
     * @param {socket} socket - socket to be removed
     */
    _removeSocket(socket) {
        if (typeof socket.playerID === 'undefined') return;
        var room = this.rooms[socket.roomID];
        delete room.sockets[socket.playerID];
    }

    /**
     * Broadcasts message to all players in a room.
     * @param {Number} roomID - room ID
     * @param {Number} playerID - player ID
     * @param {string} playerName - player name
     * @param {string} message - message
     */
    _sendRoomMessage(roomID, playerID, playerName, message) {
        var room = this.rooms[roomID];
        if (typeof room === 'undefined') return;
        for (var k in room.sockets) {
            var s = room.sockets[k];
            s.emit('message', [playerID, playerName, message]);
        }
    }

    /**
     * Handles game events.
     * @param {string} event - event name
     * @param data - event data
     */
    _gameEvent(snake, event, data) {
        // Game state update
        if (event == 'state') {
            for (var playerID in snake.room.sockets) {
                var socket = snake.room.sockets[playerID];
                socket.emit('state', data);
            }
        } else if (event == 'player_delete') {
            // Player dies
            var playerID = data;
            var room = snake.room;
            var socket = room.sockets[playerID];
            if (typeof socket !== 'undefined') {
                // Broadcast to all players in the same room
                this._sendRoomMessage(room.id, playerID, room.sockets[playerID].playerName, ' died.');

                // Notify client
                socket.emit('ended');
                socket.gameStarted = false;
            }
        }
    }
}

module.exports = SocketAPI;
