import "dotenv/config";
import notifier from "node-notifier";
import axios from "axios";
import { sendNotification } from "./utils/LinuxToast.js";
import { initaliseWebsocketConnection, emitter } from "./utils/Websocket.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const presenceCache: { [key: string]: any } = {};

if (process.platform === "linux") console.warn("Linux support might be a bit wonky, I've tried doing testing on my own system.\nPlease do open a Issue on GitHub if you have any issues with Bloxtivity!\nI will try my best to help you out.\n\thttps://github.com/WaviestBalloon/Bloxtivity/issues\n");
if (process.platform === "darwin") console.warn("Mac support has not been tested by me at all!\nPlease do open a Issue on GitHub if you have any issues with Bloxtivity!\n\thttps://github.com/WaviestBalloon/Bloxtivity/issues\n");
if (!process.env.TOKEN) throw new Error("No .ROBLOSECURITY token provided in .env file!\nDo the following: \n\t- Head to your Roblox homepage: https://roblox.com/\n\t- Open up the Developer Tools (F12 / Ctrl + Shift + I)\n\t- Go to the Storage tab\n\t- Go to Cookies and find the roblox.com domain\n\t- Find the .ROBLOSECURITY cookie and copy the value");

existsSync(join(__dirname, "..", "temp")) || mkdirSync(join(__dirname, "..", "temp"));

await initaliseWebsocketConnection(process.env.TOKEN);
let axiosClient = axios.create({
	headers: {
		"Content-Type": "application/json",
		"Accept": "application/json",
		"Cookie": `.ROBLOSECURITY=${process.env.TOKEN}`,
	}
});
async function generateCSRFToken() {
	let CSRFToken: string = null;
	console.log(axiosClient.defaults.headers);
	await axiosClient.post("https://auth.roblox.com/v2/logout").catch(err => {
		if (err.response?.status === 403) {
			CSRFToken = err.response.headers["x-csrf-token"];
			return;
		}
		console.warn(`An unknown error occurred while generating a CSRF token\nDetails: ${err.response.data.errors[0].message}`)
	});
	return CSRFToken;
}
console.log("Generating CSRF token");
axiosClient = axios.create({
	headers: {
		"Content-Type": "application/json",
		"Accept": "application/json",
		"X-CSRF-TOKEN": await generateCSRFToken(),
		".ROBLOSECURITY": `.ROBLOSECURITY=${process.env.TOKEN}`,
	}
});
setInterval(async () => {
	console.log("Regenerating CSRF token");
	axiosClient = axios.create({
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
			".ROBLOSECURITY": `.ROBLOSECURITY=${process.env.TOKEN}`,
		}
	});
	let CSRFToken: string = await generateCSRFToken();
	axiosClient = axios.create({
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
			"X-CSRF-TOKEN": CSRFToken,
			".ROBLOSECURITY": `.ROBLOSECURITY=${process.env.TOKEN}`,
		}
	});
}, 1000 * 60 * 5);


emitter.on("websocketReady", async (data) => {
	console.log("Websocket has been initialised!");
});
emitter.on("presenceChanged", async (userId) => {
	console.log(`Presence changed for user ${userId}`);
	const cached = presenceCache[userId];
	
	console.log(`Getting presence info for user ${userId}`);
	const presence = await axiosClient.post(`https://presence.roblox.com/v1/presence/users`, JSON.stringify({
		"userIds": [userId]
	}));
	if (cached?.lastLocation === presence.data.userPresences[0].lastLocation && cached?.presenceType === presence.data.userPresences[0].userPresenceType) return console.log(`Presence for user ${userId} has not changed, ignoring...`);
	console.log(`Getting user info for user ${userId}`);
	const userInfo = await axiosClient.get(`https://users.roblox.com/v1/users/${userId}`);
	console.log(`Resolving icon for user ${userId}`);
	const profilePicture = await axiosClient.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`);
	console.log(`Downloading icon for user ${userId}`);
	const profilePictureRaw = await axiosClient.get(profilePicture?.data?.data[0]?.imageUrl, { responseType: "arraybuffer" });
	if (profilePictureRaw) await writeFileSync(join(__dirname, "..", "temp", `${userId}.png`), profilePictureRaw.data);

	let location
	switch (presence.data.userPresences[0].userPresenceType) {
		case 0:
			location = "went offline";
			break;
		case 1:
			location = "is now online";
			break;
		case 2:
			location = "is now in-game";
			break;
		case 3:
			location = "is now in Studio";
			break;
	
		default:
			break;
	}

	/*if (presence.data[0].userPresenceType === 2 || presence.data[0].userPresenceType === 3) {
		const gameInfo = await axiosClient.get(`https://games.roblox.com/v1/games?universeIds=${presence.data[0].universeId}`);
		console.log(gameInfo.data);
	}*/
	let message = null;
	console.log(`Last: ${presence.data.userPresences[0].lastLocation}`);
	presenceCache[userId] = {
		lastLocation: presence.data.userPresences[0].lastLocation,
		presenceType: presence.data.userPresences[0].userPresenceType,
	};
	if (presence.data.userPresences[0].userPresenceType === 2) {
		message = `${userInfo.data?.displayName ? userInfo.data?.displayName : userInfo.data.name} is now playing ${presence.data.userPresences[0].lastLocation}`;
	} else if (presence.data.userPresences[0].userPresenceType === 3) {
		message = `${userInfo.data?.displayName ? userInfo.data?.displayName : userInfo.data.name} is editing ${presence.data.userPresences[0].lastLocation}`;
	}

	if (message) {
		if (process.platform === "linux") {
			sendNotification({
				title: `${userInfo.data.name} ${location}`,
				message: message,
				icon: join(__dirname, "..", "temp", `${userId}.png`),
				appName: "Bloxtivity",
				//actions: ["Join game", "View game page"],
			});
		} else {
			notifier.notify({
				title: `${userInfo.data.name} ${location}`,
				message: message,
				sound: false,
				icon: join(__dirname, "..", "temp", `${userId}.png`),
			});
		}
	} else {
		if (process.platform === "linux") {
			sendNotification({
				title: `${userInfo.data.name} ${location}`,
				icon: join(__dirname, "..", "temp", `${userId}.png`),
				appName: "Bloxtivity",
			});
		} else {
			notifier.notify({
				title: `${userInfo.data.name} ${location}`,
				message: message,
				sound: false,
				icon: join(__dirname, "..", "temp", `${userId}.png`),
			});
		}
	}
});

/*
notifier.notify({
	title: "WaviestBalloon is in-game",
	message: "WaviestBalloon is now playing QS Energy Research Facility",
	icon: join(__dirname, "test.png"),
	closeLabel: 'Absolutely not',
	actions: ['Yes', 'No'],
});

*/


