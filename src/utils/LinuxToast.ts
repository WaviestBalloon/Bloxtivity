import { execSync } from "child_process";
/* Unfortantly, I was unable to get node-notifier to work as intended on Linux (Arch Linux for my case)
   This is my own implementation of notify-send */

interface Notification {
	title: string;
	message?: string;
	icon?: string;
	appName?: string;
	actions?: string[];
	wait?: boolean;
}

export async function sendNotification(options: Notification) {
	const actions = options.actions ? options.actions.map((action) => `--action="${action}"`).join(" ") : "";
	try {
		const stdout = execSync(`notify-send --app-name=${options.appName ? options.appName : "Node.js Notification"} ${actions} ${options.wait ? "--wait" : ""} --icon="${options.icon}" "${options.title}" ${options.message ? `"${options.message}"` : ""}`);
		return stdout.toString().trim();
	} catch (err) {
		console.warn(`Failed to send toast, too many notifications? Or do you not have notify-send?`)
		return
	}
}
