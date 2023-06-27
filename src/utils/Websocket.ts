import WebSocket from "ws";
import { EventEmitter } from "events";
let emitter = new EventEmitter();

export async function initaliseWebsocketConnection(token: string) {
	let socket: WebSocket;
	let refreshing = false;

	console.log("Connecting to Websocket");
	try {
		socket = new WebSocket(`wss://realtime-signalr.roblox.com/userhub`, {
			headers: {
				Cookie: `.ROBLOSECURITY=${token}`,
			}
		});
	} catch (err) {
		throw new Error(`An error occurred while attempting to connect to the Websocket\nDetails: ${err}`);
	}

	setTimeout(() => { // Refresh the websocket every 6 hours
		refreshing = true;
		socket.close();
	}, 21600000)
	socket.once("error", (err) => {
		throw new Error(`Failed to initialise WebSocket connection with realtime.roblox.com\nDetails: ${err}`);
	});
	socket.once("open", () => {
		console.log("Sending handshake to Websocket");
		socket.send(`{"protocol":"json","version":1}`); // DO NOT REMOVE THAT ODD CHARACTER AT THE END, IT IS NEEDED FOR SOME GOD AWFUL REASON
		emitter.emit("websocketReady", true);
	});
	socket.once("close", () => {
		if (refreshing) {
			initaliseWebsocketConnection(token);
		} else {
			console.warn("Realtime WebSocket closed unexpectedly, attempting to reconnect");
			try {
				socket.close();
			} catch (err) {
				console.warn("Failed to force close the Realtime WebSocket, attempting to reconnect anyway");
			}
			initaliseWebsocketConnection(token);
		}
	});
	socket.on("message", (data: any) => { // Should be data: Buffer but causes type errors and I cannot be bothered with that :sob:
		let sanitised = data.slice(0, data.toString().length - 1); // Remove the extra character at the end of the message, thanks Roblox :(
		let json = JSON.parse(sanitised);
		emitter.emit("websocketRaw", json);
		
		if (!json?.target) return;
		if (json.target === "notification" && json.arguments[0] === "PresenceBulkNotifications") {
			emitter.emit("presenceChanged", JSON.parse(json.arguments[1])[0].UserId);
		}
	});

	return socket;
}

export { emitter };
